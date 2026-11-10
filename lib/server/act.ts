import "server-only";

import { KelabError } from "@/lib/errors";
import type { Ctx } from "@/lib/server/service";
import { guard, type Result } from "@/lib/server/result";
import { requireCtx, requireUser, resolveClub } from "@/lib/server/session";
import type { Snapshot } from "@/lib/types";

/**
 * Runs `fn` for the session user's club. A club id taken from the cookie that turns out not to be
 * theirs (FORBIDDEN, raised by the membership check before `fn` ran anything) is replaced by a
 * lookup and tried once more; any other outcome is the real one.
 */
async function withCtx<T>(fn: (ctx: Ctx) => Promise<T>, collect?: Ctx["collect"]): Promise<T> {
  const ctx = { ...(await requireCtx()), collect };
  try {
    return await fn(ctx);
  } catch (error) {
    if (!(ctx.fromCookie && error instanceof KelabError && error.code === "FORBIDDEN")) throw error;
    const fresh = await resolveClub(await requireUser());
    if (fresh.clubId === ctx.clubId) throw error;
    return fn({ ...fresh, collect });
  }
}

/** Every server action: session and club resolved here, then the operation, errors as a Result. */
export const act = <T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> => guard(() => withCtx(fn));

/** A change: like `act`, and the Result also carries the snapshot read in the change's own transaction. */
export async function actMutation<T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> {
  const collect: { snapshot?: Snapshot } = {};
  const result = await guard(() => withCtx(fn, collect));
  return result.ok && collect.snapshot ? { ...result, snapshot: collect.snapshot } : result;
}
