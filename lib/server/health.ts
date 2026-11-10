// Health report for GET /api/health. Pure composition: the route passes the probes in, so the
// timeout, the status mapping and the "nothing but ok/fail leaves this function" rule are testable
// without a database. Errors from a probe are reduced to a status word; messages can carry hosts.

export type CheckStatus = "ok" | "fail" | "timeout";
export type HealthReport = {
  status: "ok" | "degraded";
  version: string;
  checks: { database: CheckStatus; storage: CheckStatus };
};

export const HEALTH_TIMEOUT_MS = 2000;

async function probe(run: (signal: AbortSignal) => Promise<void>, timeoutMs: number): Promise<CheckStatus> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal).then(() => "ok" as const), timedOut]);
  } catch {
    return controller.signal.aborted ? "timeout" : "fail";
  } finally {
    clearTimeout(timer);
  }
}

/** Short commit sha from the Vercel build, or "dev" when not built there. */
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 7) : "dev";
}

export async function buildHealth(
  probes: { database: (signal: AbortSignal) => Promise<void>; storage: (signal: AbortSignal) => Promise<void> },
  options: { timeoutMs?: number; version?: string } = {},
): Promise<{ httpStatus: 200 | 503; report: HealthReport }> {
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const [database, storage] = await Promise.all([probe(probes.database, timeoutMs), probe(probes.storage, timeoutMs)]);
  const ok = database === "ok" && storage === "ok";
  return {
    httpStatus: ok ? 200 : 503,
    report: { status: ok ? "ok" : "degraded", version: options.version ?? appVersion(), checks: { database, storage } },
  };
}

/**
 * Bounds how often the probes run, whatever the request rate. /api/health is public, so every hit would
 * otherwise cost a database query and a bucket HEAD. Concurrent callers share one in-flight run, and a
 * finished result is reused for `ttlMs` (per warm instance; serverless has no shared memory, and a few
 * instances each probing once per window is the bound we want). Time is injected for tests.
 */
export function memoizeHealth<T>(run: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  let cached: { at: number; value: T } | null = null;
  return () => {
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    inflight ??= run()
      .then((value) => {
        cached = { at: now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
