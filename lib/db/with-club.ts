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
  /** Names this transaction in timing logs (e.g. "load"). */
  label?: string;
};

// Round trips and wall time per transaction, so "is it slow" is a number. Logged in `next dev`
// or when KELABKIT_TIMING=1; also pushed to globalThis.__kelabTimings for tests. Never logs SQL or values.
export type TxTiming = { label: string; roundTrips: number; connectMs: number; totalMs: number };
const timingOn = () => process.env.KELABKIT_TIMING === "1" || process.env.NODE_ENV === "development";

function record(timing: TxTiming) {
  const g = globalThis as unknown as { __kelabTimings?: TxTiming[] };
  (g.__kelabTimings ??= []).push(timing);
  if (g.__kelabTimings.length > 200) g.__kelabTimings.shift();
  console.log(`[kk-timing] ${timing.label} roundTrips=${timing.roundTrips} connect=${timing.connectMs.toFixed(0)}ms total=${timing.totalMs.toFixed(0)}ms`);
}

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
  const timing = timingOn() ? { started: performance.now(), roundTrips: 0, connectMs: 0 } : null;
  const client = await pool().connect();
  if (timing) timing.connectMs = performance.now() - timing.started;
  // Counts every statement sent on this connection (the transaction's round trips).
  const tx: Tx = timing
    ? new Proxy(client, {
        get(target, prop) {
          if (prop === "query") {
            return (...args: unknown[]) => {
              timing.roundTrips += 1;
              return (target.query as (...a: unknown[]) => unknown)(...args);
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })
    : client;
  try {
    // One round trip for the whole preamble (simple protocol, several statements). The ids are
    // validated UUIDs above, so inlining them is safe; a non-member makes kk_assert_member raise,
    // which aborts the batch and lands in the rollback below. A club id from a cookie or request is
    // never trusted: membership is checked in this same batch, before anything else runs.
    await tx.query(
      [
        options.readOnlySnapshot ? "begin isolation level repeatable read read only" : "begin",
        "set local role kelabkit_app",
        `select set_config('app.user_id', '${userId}', true), set_config('app.club_id', '${clubId ?? ""}', true)`,
        clubId ? `select kk_assert_member('${clubId}'::uuid)` : "select 1",
      ].join("; "),
    );
    const result = await fn(tx);
    await tx.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw mapDbError(error);
  } finally {
    client.release();
    if (timing) record({ label: options.label ?? "tx", roundTrips: timing.roundTrips, connectMs: timing.connectMs, totalMs: performance.now() - timing.started });
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

/**
 * One read-only REPEATABLE READ snapshot as the connection's own role (kelabkit_owner, BYPASSRLS), with no
 * app role, user or club set. It sees every club, which is the point of a backup and the reason it is not
 * `withClub`. Only lib/server/backup.ts may import it (tests/db-boundary.test.ts); never reachable from an
 * action or a user-facing route.
 */
export async function withBackupSnapshot<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const result = await fn(client);
    await client.query("rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Health probe: one `select 1` on the shared pool, no role or club. Rejects on error or after `timeoutMs`. */
export async function pingDatabase(timeoutMs = 2000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("database ping timed out")), timeoutMs);
  });
  try {
    await Promise.race([pool().query("select 1"), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only: closes the shared pool. */
export async function closePool() {
  await globalForPool.__kelabPool?.end();
  globalForPool.__kelabPool = undefined;
}
