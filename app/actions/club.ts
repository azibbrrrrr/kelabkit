"use server";

import type { ClubChanges } from "@/lib/backend/types";
import { actMutation } from "@/lib/server/act";
import { guard } from "@/lib/server/result";
import * as service from "@/lib/server/service";
import { requireUser, setClubCookie } from "@/lib/server/session";

export async function updateClub(changes: ClubChanges) {
  return actMutation((ctx) => service.updateClub(ctx, changes));
}

/** First-run: creates the club with the caller as owner and makes it the active club. */
export async function createClub(input: { name: string; session: string; school: string | null; treasurerName: string | null }) {
  return guard(async () => {
    const user = await requireUser();
    const id = await service.createClub(user.id, input);
    await setClubCookie(id);
    return id;
  });
}
