import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { MODE_COOKIE } from "@/lib/auth/mode";
import { getAuth } from "@/lib/auth/server";
import { KelabError } from "@/lib/errors";
import { logMissingEnv, missingSignedInEnv } from "@/lib/server/env";
import { listClubs, type ClubSummary, type Ctx } from "@/lib/server/service";

export const CLUB_COOKIE = "kk_club";

export type SessionUser = { id: string; name: string; email: string; image: string | null };

/** The signed-in user from the verified Neon Auth session, or null. */
export async function getUser(): Promise<SessionUser | null> {
  if (missingSignedInEnv().length > 0) return null;
  const { data } = await getAuth().getSession();
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name || user.email || "Pengguna", email: user.email ?? "", image: user.image ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new KelabError("UNAUTHENTICATED");
  return user;
}

/** The club to act in: the `kk_club` cookie if the user belongs to it, else their oldest club. */
export function pickClub(clubs: ClubSummary[], preferred: string | undefined): ClubSummary | null {
  return clubs.find((club) => club.id === preferred) ?? clubs[0] ?? null;
}

/** Session user plus active club, resolved server-side for every action. Nothing here comes from the request body. */
export async function requireCtx(): Promise<Ctx> {
  const user = await requireUser();
  const club = pickClub(await listClubs(user.id), (await cookies()).get(CLUB_COOKIE)?.value);
  if (!club) throw new KelabError("NO_CLUB");
  return { userId: user.id, clubId: club.id, userName: user.name };
}

export type AppContext =
  | { mode: "demo" }
  | { mode: "neon"; user: SessionUser; hasClub: boolean }
  | { mode: "signed-out" }
  /** Signed-in mode needs environment variables this deployment does not have; only the demo works. */
  | { mode: "unconfigured" };

/** What the shell needs per page load. Demo wins when the user chose it; no database access in demo mode. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  if ((await cookies()).get(MODE_COOKIE)?.value === "demo") return { mode: "demo" };
  const missing = missingSignedInEnv();
  if (missing.length > 0) {
    logMissingEnv(missing, "getAppContext");
    return { mode: "unconfigured" };
  }
  const user = await getUser();
  if (!user) return { mode: "signed-out" };
  return { mode: "neon", user, hasClub: (await listClubs(user.id)).length > 0 };
});
