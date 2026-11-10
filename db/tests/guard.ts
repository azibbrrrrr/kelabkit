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

/** Every fixture is named with this prefix: clubs by name, storage objects by key prefix. */
export const TEST_PREFIX = "kk-test-";

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

export function residueMessage(r: Residue): string | null {
  const tables = Object.entries(r.tables).filter(([, n]) => n > 0);
  if (r.clubs === 0 && tables.length === 0 && r.objects.length === 0) return null;
  const parts = [`${r.clubs} kk-test-* club(s)`, ...tables.map(([t, n]) => `${n} row(s) in ${t}`), `${r.objects.length} kk-test-* object(s)`];
  return `db:test left fixtures behind: ${parts.join(", ")}. Clean them up (and fix the test that leaked them).`;
}
