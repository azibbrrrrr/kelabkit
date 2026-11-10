// Safety rails for `npm run db:test`. The suite writes to the Neon dev branch, which is also the
// production database (one DB), so it must refuse to start without an explicit opt-in and must
// prove it left nothing behind. Pure functions here; db/tests/global-setup.ts wires them in and
// tests/db-test-guard.test.ts covers them without a database.

/** Throws unless the environment explicitly says this is the dev database. */
export function assertDbTestEnv(env: Record<string, string | undefined>): void {
  if (env.KELABKIT_DB_ENV !== "dev") {
    throw new Error("db:test writes to the database: set KELABKIT_DB_ENV=dev and point DATABASE_URL_UNPOOLED at the dev branch.");
  }
  if (!env.DATABASE_URL_UNPOOLED?.trim()) {
    throw new Error("db:test needs DATABASE_URL_UNPOOLED (the direct connection).");
  }
}

/** Every fixture of any run starts with this; the stale sweep looks for it. */
export const TEST_PREFIX = "kk-test-";

/** Fixtures older than this are leftovers of a crashed run and may be swept by a later one. */
export const STALE_AFTER_HOURS = 1;

/** Set once per run by global-setup (workers inherit it). Two runs on one database never share a prefix. */
export function runId(env: Record<string, string | undefined> = process.env): string {
  const id = env.KELABKIT_TEST_RUN;
  if (!id || !/^[0-9a-f]{8}$/.test(id)) throw new Error("KELABKIT_TEST_RUN is not set: db:test fixtures must be named per run (see db/tests/global-setup.ts).");
  return id;
}

/** `kk-test-<runId>-`: prefix for this run's club names, user labels and storage keys. Cleanup and the residue check touch only this. */
export function runPrefix(env?: Record<string, string | undefined>): string {
  return `${TEST_PREFIX}${runId(env)}-`;
}

/** Club-scoped tables, children first. Residue is counted per table so the failure says where. */
export const CLUB_TABLES = [
  "audit_logs",
  "attachments",
  "payment_allocations",
  "payments",
  "charges",
  "participants",
  "collection_periods",
  "collections",
  "members",
  "club_settings",
  "club_members",
] as const;

export type Residue = { clubs: number; tables: Record<string, number>; objects: string[] };

export function residueMessage(r: Residue, prefix = TEST_PREFIX): string | null {
  const tables = Object.entries(r.tables).filter(([, n]) => n > 0);
  if (r.clubs === 0 && tables.length === 0 && r.objects.length === 0) return null;
  const parts = [`${r.clubs} ${prefix}* club(s)`, ...tables.map(([t, n]) => `${n} row(s) in ${t}`), `${r.objects.length} ${prefix}* object(s)`];
  return `db:test left fixtures behind: ${parts.join(", ")}. Clean them up (and fix the test that leaked them).`;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Deletes one club and everything under it, children first. */
export async function dropClubCascade(pool: Queryable, clubId: string): Promise<void> {
  await pool.query("delete from rate_limits where bucket in (select 'mutation:' || user_id::text from club_members where club_id = $1)", [clubId]);
  for (const table of CLUB_TABLES) await pool.query(`delete from ${table} where club_id = $1`, [clubId]);
  await pool.query("delete from clubs where id = $1", [clubId]);
}

/** Removes kk-test-* clubs older than STALE_AFTER_HOURS (any run). Never touches a recent run's fixtures. Returns how many it removed. */
export async function sweepStaleClubs(pool: Queryable): Promise<number> {
  const stale = await pool.query("select id from clubs where name like $1 and created_at < now() - make_interval(hours => $2)", [`${TEST_PREFIX}%`, STALE_AFTER_HOURS]);
  for (const row of stale.rows) await dropClubCascade(pool, row.id as string);
  return stale.rows.length;
}
