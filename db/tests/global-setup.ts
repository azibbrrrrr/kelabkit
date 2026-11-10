import { randomBytes } from "node:crypto";
import { createPool } from "../client";
import { assertDbTestEnv, CLUB_TABLES, residueMessage, runPrefix, STALE_AFTER_HOURS, sweepStaleClubs, TEST_PREFIX, type Residue } from "./guard";

// Runs once around the whole db:test run. Setup refuses to start unless this is the dev database,
// gives the run its own id (every fixture is named kk-test-<runId>-*, so concurrent runs on the one
// database cannot touch each other), and sweeps fixtures older than an hour left by crashed runs.
// Teardown fails the run when anything under THIS run's prefix remains: clubs, their rows, or objects.

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be exported (CI).
}

export async function setup() {
  assertDbTestEnv(process.env);
  process.env.KELABKIT_TEST_RUN = randomBytes(4).toString("hex");
  const pool = createPool("DATABASE_URL_UNPOOLED", 1);
  try {
    const swept = await sweepStaleClubs(pool);
    if (swept) console.log(`[db:test] swept ${swept} stale kk-test-* club(s) older than ${STALE_AFTER_HOURS}h`);
  } finally {
    await pool.end();
  }
}

export async function teardown() {
  const prefix = runPrefix();
  const pool = createPool("DATABASE_URL_UNPOOLED", 1);
  try {
    const residue: Residue = { clubs: 0, tables: {}, objects: [] };
    const like = `${prefix}%`;
    residue.clubs = Number((await pool.query("select count(*)::int as n from clubs where name like $1", [like])).rows[0].n);
    for (const table of CLUB_TABLES) {
      const sql = `select count(*)::int as n from ${table} where club_id in (select id from clubs where name like $1)`;
      residue.tables[table] = Number((await pool.query(sql, [like])).rows[0].n);
    }
    // Storage is optional locally; when it is configured, fixtures must not leave objects.
    const { missingStorageEnv } = await import("../../lib/server/env");
    if (missingStorageEnv().length === 0) {
      const { listObjects } = await import("../../lib/server/storage");
      residue.objects = (await listObjects(prefix)).map((o) => o.key);
      const cutoff = Date.now() - STALE_AFTER_HOURS * 3_600_000;
      const { deleteObject } = await import("../../lib/server/storage");
      for (const o of await listObjects(TEST_PREFIX)) {
        if (!o.key.startsWith(prefix) && o.lastModified && o.lastModified.getTime() < cutoff) await deleteObject(o.key);
      }
    }
    const message = residueMessage(residue, prefix);
    if (message) throw new Error(message);
  } finally {
    await pool.end();
  }
}
