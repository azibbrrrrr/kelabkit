import type { PoolClient } from "@neondatabase/serverless";
import { createPool } from "../client";
import { assertDbTestEnv, CLUB_TABLES, residueMessage, TEST_PREFIX, type Residue } from "./guard";

// Runs once around the whole db:test run. Setup refuses to start unless this is the dev database;
// teardown fails the run when any kk-test-* club, its rows, or a kk-test-* storage object remains.

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be exported (CI).
}

// Every suite starts by deleting all kk-test-* clubs, so two runs on the one database destroy each
// other's fixtures. A session-level advisory lock on a dedicated connection serialises runs: a second
// run refuses to start instead of corrupting the first (and the residue check below stays truthful).
const LOCK_KEY = "kelabkit-db-test";
let lockClient: PoolClient | undefined;
let lockPool: ReturnType<typeof createPool> | undefined;

export async function setup() {
  assertDbTestEnv(process.env);
  lockPool = createPool("DATABASE_URL_UNPOOLED", 1);
  lockClient = await lockPool.connect();
  const got = (await lockClient.query("select pg_try_advisory_lock(hashtext($1)) as ok", [LOCK_KEY])).rows[0].ok as boolean;
  if (!got) {
    lockClient.release();
    await lockPool.end();
    throw new Error("Another db:test run holds the lock on this database. Wait for it to finish; runs share one set of kk-test-* fixtures.");
  }
}

export async function teardown() {
  const pool = createPool("DATABASE_URL_UNPOOLED", 1);
  try {
    const residue: Residue = { clubs: 0, tables: {}, objects: [] };
    residue.clubs = Number((await pool.query("select count(*)::int as n from clubs where name like $1", [`${TEST_PREFIX}%`])).rows[0].n);
    for (const table of CLUB_TABLES) {
      const sql = `select count(*)::int as n from ${table} where club_id in (select id from clubs where name like $1)`;
      residue.tables[table] = Number((await pool.query(sql, [`${TEST_PREFIX}%`])).rows[0].n);
    }
    // Storage is optional locally; when it is configured, fixtures must not leave objects.
    const { missingStorageEnv } = await import("../../lib/server/env");
    if (missingStorageEnv().length === 0) {
      const { listObjects } = await import("../../lib/server/storage");
      residue.objects = (await listObjects(TEST_PREFIX)).map((o) => o.key);
    }
    const message = residueMessage(residue);
    if (message) throw new Error(message);
  } finally {
    await pool.end();
    await lockClient?.query("select pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined);
    lockClient?.release();
    await lockPool?.end();
  }
}
