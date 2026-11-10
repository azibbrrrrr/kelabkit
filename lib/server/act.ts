import "server-only";

import type { Ctx } from "@/lib/server/service";
import { guard, type Result } from "@/lib/server/result";
import { requireCtx } from "@/lib/server/session";

/** Every server action: session and club resolved here, then the operation, errors as a Result. */
export const act = <T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> => guard(async () => fn(await requireCtx()));
