import "server-only";

// The only module that talks to Postgres at runtime (tests/db-boundary.test.ts enforces it).
// Every request runs in one transaction as the restricted role `kelabkit_app` with the
// verified user and club set as transaction-local settings, so row level security and the
// kk_* membership checks (migration 0003) apply to everything that follows.

import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { KelabError, errorMessages, type ErrorCode } from "@/lib/errors";

neonConfig.webSocketConstructor = ws;

const globalForPool = globalThis as unknown as { __kelabPool?: Pool };

function pool() {
  if (!globalForPool.__kelabPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    globalForPool.__kelabPool = new Pool({ connectionString: url, max: 5 });
  }
  return globalForPool.__kelabPool;
}

export type Tx = PoolClient;
type Options = {
  /** One consistent snapshot for reads that span several queries. Never use for money writes (READ COMMITTED). */
  readOnlySnapshot?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres P0001 raised by our functions carries a code from lib/errors.ts as its message. */
export function mapDbError(error: unknown): unknown {
  if (error instanceof KelabError) return error;
  const e = error as { code?: string; message?: string };
  if (e?.code === "P0001" && e.message && e.message in errorMessages) return new KelabError(e.message as ErrorCode);
  // Check violations and the like from direct writes are not user-facing codes.
  return error;
}

async function run<T>(userId: string, clubId: string | null, fn: (tx: Tx) => Promise<T>, options: Options): Promise<T> {
  if (!UUID.test(userId) || (clubId !== null && !UUID.test(clubId))) throw new KelabError("FORBIDDEN");
  const client = await pool().connect();
  try {
    await client.query(options.readOnlySnapshot ? "begin isolation level repeatable read read only" : "begin");
    await client.query("set local role kelabkit_app");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.club_id', $2, true)", [userId, clubId ?? ""]);
    // A club id from a cookie or request is never trusted: membership first.
    if (clubId) await client.query("select kk_assert_member($1)", [clubId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw mapDbError(error);
  } finally {
    client.release();
  }
}

/** One transaction scoped to a club the user belongs to (FORBIDDEN otherwise). */
export function withClub<T>(userId: string, clubId: string, fn: (tx: Tx) => Promise<T>, options: Options = {}) {
  return run(userId, clubId, fn, options);
}

/** One transaction with a user but no club: kk_my_clubs() and kk_create_club(). */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, options: Options = {}) {
  return run(userId, null, fn, options);
}

/** Tests only: closes the shared pool. */
export async function closePool() {
  await globalForPool.__kelabPool?.end();
  globalForPool.__kelabPool = undefined;
}
