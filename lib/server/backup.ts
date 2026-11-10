import "server-only";

import { withBackupSnapshot } from "@/lib/db/with-club";
import { backupKey, buildManifest, encodeBackup, expiredBackupKeys, manifestKey, BACKUP_PREFIX, type BackupFile } from "@/lib/backup/format";
import { deleteObject, listObjects, putObject, headObject } from "@/lib/server/storage";

// Daily logical backup of every app table, all clubs, in one REPEATABLE READ snapshot, written to
// the bucket as gzipped JSON. Tables are discovered from the catalog, so a table added by a later
// migration is included without touching this file. Payment proof files are NOT in the backup:
// they already live in the bucket and the attachments table (which is backed up) names them.

export type BackupResult = {
  key: string;
  sizeBytes: number;
  schemaMigration: { count: number; lastHash: string | null };
  rowCounts: Record<string, number>;
  expiredDeleted: number;
};

type Row = Record<string, unknown>;

/** Parents before children, ties alphabetical, so restore can insert in order. Cycles are an error. */
function orderTables(tables: string[], edges: { child: string; parent: string }[]): string[] {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((t) => edges.every((e) => e.child !== t || e.parent === t || !remaining.has(e.parent)))
      .sort();
    if (ready.length === 0) throw new Error("Foreign key cycle between app tables; cannot order a restore.");
    for (const t of ready) {
      ordered.push(t);
      remaining.delete(t);
    }
  }
  return ordered;
}

export async function runBackup(now = new Date()): Promise<BackupResult> {
  const { file } = await withBackupSnapshot(async (tx) => {
    const names = (await tx.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows.map(
      (r: Row) => r.table_name as string,
    );
    const edges = (
      await tx.query(
        "select conrelid::regclass::text as child, confrelid::regclass::text as parent from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace",
      )
    ).rows as { child: string; parent: string }[];
    const ordered = orderTables(names, edges);
    const mig = (await tx.query("select count(*)::int as n, (array_agg(hash order by id desc))[1] as last_hash, max(created_at)::text as last_created from drizzle.__drizzle_migrations")).rows[0] as Row;
    const tables: Record<string, Row[]> = {};
    for (const name of ordered) {
      // Names come from the catalog and buildManifest re-checks them; quoting is belt and braces.
      const rows = (await tx.query(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from "${name.replace(/"/g, '""')}" t`)).rows[0].rows as Row[];
      tables[name] = rows;
    }
    const manifest = buildManifest(now, { count: Number(mig.n), lastHash: (mig.last_hash as string) ?? null, lastCreatedAt: (mig.last_created as string) ?? null }, ordered, tables);
    return { file: { manifest, tables } satisfies BackupFile };
  });

  const body = encodeBackup(file);
  const key = backupKey(now);
  await putObject(key, body, "application/gzip");
  await putObject(manifestKey(now), Buffer.from(JSON.stringify(file.manifest, null, 2)), "application/json");
  const stored = await headObject(key);
  if (!stored || stored.sizeBytes !== body.byteLength) throw new Error("Backup upload could not be verified (size mismatch).");

  // Retention runs only after the new backup is stored and verified.
  const old = expiredBackupKeys((await listObjects(BACKUP_PREFIX)).map((o) => o.key), now);
  for (const k of old) await deleteObject(k);

  return {
    key,
    sizeBytes: body.byteLength,
    schemaMigration: { count: file.manifest.schemaMigration.count, lastHash: file.manifest.schemaMigration.lastHash },
    rowCounts: file.manifest.rowCounts,
    expiredDeleted: old.length,
  };
}
