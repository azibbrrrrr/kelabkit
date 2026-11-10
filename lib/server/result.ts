import "server-only";

import { KelabError, type ErrorCode } from "@/lib/errors";
import { mapDbError } from "@/lib/db/with-club";

// Server actions cannot throw to the browser: in production Next replaces the message of a
// thrown error. Actions return this envelope instead and lib/backend/neon.ts re-throws a
// KelabError on the client.
export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; detail?: string };

export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const mapped = mapDbError(error);
    if (mapped instanceof KelabError) return { ok: false, code: mapped.code, detail: mapped.detail };
    // Log the class of failure only: never the error object, which can carry query text.
    const e = error as { code?: string; message?: string };
    console.error("kelabkit action failed", e?.code ?? "", e?.message?.slice(0, 200) ?? "");
    return { ok: false, code: "INTERNAL" };
  }
}
