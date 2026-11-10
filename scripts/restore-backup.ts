// Restore a KelabKit backup (backups/YYYY-MM-DD/kelabkit.json.gz) into a target database.
//
//   RESTORE_DATABASE_URL=<target> npx tsx scripts/restore-backup.ts --file ./kelabkit.json.gz [--replace]
//   RESTORE_DATABASE_URL=<target> npx tsx scripts/restore-backup.ts --from-bucket backups/2026-11-11/kelabkit.json.gz
//
// The target is read from RESTORE_DATABASE_URL only (never printed). The script refuses a target whose
// Neon endpoint matches DATABASE_URL / DATABASE_URL_UNPOOLED (production) unless
// --i-know-this-is-production is passed, and refuses when it cannot tell. It also refuses a target whose
// schema is not the backup's (migration count and last hash), and a target that already holds rows
// unless --replace is given (then all app tables are truncated first). Everything is one transaction:
// any failure, or a row count that differs from the manifest, rolls back and leaves the target untouched.

import { readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { decodeBackup } from "../lib/backup/format";
import { checkRestoreTarget } from "../lib/backup/target";

neonConfig.webSocketConstructor = ws;
try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be exported.
}

function fail(message: string): never {
  console.error(`restore-backup: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function readBackup(): Promise<Uint8Array> {
  const file = value("--file");
  const key = value("--from-bucket");
  if (!file === !key) fail("pass exactly one of --file <path> or --from-bucket <key>.");
  if (file) return readFileSync(file);
  if (!key!.startsWith("backups/")) fail("--from-bucket only reads keys under backups/.");
  const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const env = process.env;
  for (const name of ["NEON_STORAGE_ENDPOINT", "NEON_STORAGE_REGION", "NEON_STORAGE_BUCKET", "NEON_STORAGE_ACCESS_KEY_ID", "NEON_STORAGE_SECRET_ACCESS_KEY"]) {
    if (!env[name]) fail(`${name} is not set.`);
  }
  const client = new S3Client({
    endpoint: env.NEON_STORAGE_ENDPOINT,
    region: env.NEON_STORAGE_REGION,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID!, secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY! },
  });
  const out = await client.send(new GetObjectCommand({ Bucket: env.NEON_STORAGE_BUCKET, Key: key }));
  return out.Body!.transformToByteArray();
}

async function main() {
  const target = process.env.RESTORE_DATABASE_URL;
  if (!target) fail("RESTORE_DATABASE_URL is not set.");
  const verdict = checkRestoreTarget(target, [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED], flag("--i-know-this-is-production"));
  if (!verdict.ok) fail(verdict.reason);

  const { manifest, tables } = decodeBackup(await readBackup());
  console.log(`backup created ${manifest.createdAt}, ${manifest.tableOrder.length} tables, migrations ${manifest.schemaMigration.count}`);

  const pool = new Pool({ connectionString: target, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const live = (await client.query("select count(*)::int as n, (array_agg(hash order by id desc))[1] as last_hash from drizzle.__drizzle_migrations")).rows[0];
    if (live.n !== manifest.schemaMigration.count || live.last_hash !== manifest.schemaMigration.lastHash) {
      throw new Error(`Schema mismatch: target has ${live.n} migrations, the backup was taken at ${manifest.schemaMigration.count} (or a different last migration). Migrate the target first.`);
    }
    const names = (await client.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows.map((r) => r.table_name as string);
    if (JSON.stringify([...names].sort()) !== JSON.stringify([...manifest.tableOrder].sort())) throw new Error("The target's tables differ from the backup's.");

    let existing = 0;
    for (const name of manifest.tableOrder) existing += (await client.query(`select count(*)::int as n from "${name}"`)).rows[0].n;
    if (existing > 0 && !flag("--replace")) throw new Error(`The target already holds ${existing} rows. Pass --replace to truncate the app tables first.`);

    await client.query(`truncate ${manifest.tableOrder.map((n) => `"${n}"`).join(", ")} restart identity cascade`);
    for (const name of manifest.tableOrder) {
      if (tables[name].length === 0) continue;
      await client.query(`insert into "${name}" select * from jsonb_populate_recordset(null::"${name}", $1::jsonb)`, [JSON.stringify(tables[name])]);
    }

    const rows: { table: string; backup: number; restored: number }[] = [];
    for (const name of manifest.tableOrder) {
      const restored = (await client.query(`select count(*)::int as n from "${name}"`)).rows[0].n as number;
      rows.push({ table: name, backup: manifest.rowCounts[name], restored });
    }
    console.table(rows);
    const bad = rows.filter((r) => r.backup !== r.restored);
    if (bad.length) throw new Error(`Row counts differ after restore for: ${bad.map((r) => r.table).join(", ")}`);
    await client.query("commit");
    console.log("restore committed.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    fail(error instanceof Error ? error.message : "restore failed");
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
