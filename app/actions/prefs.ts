"use server";

import { guard } from "@/lib/server/result";
import * as service from "@/lib/server/service";
import { requireUser } from "@/lib/server/session";

/**
 * Saves display preferences for the session user. Per user, not per club, so it needs no club
 * (a first-time user still choosing a language has none). The patch is validated again in the
 * service: unknown keys are dropped, an oversized one is refused.
 */
export async function savePrefs(patch: unknown) {
  return guard(async () => {
    const user = await requireUser();
    await service.savePrefs(user.id, patch);
  });
}
