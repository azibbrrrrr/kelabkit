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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setClubCookie(clubId: string) {
  (await cookies()).set(CLUB_COOKIE, clubId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
}

/** The user's club looked up in the database (their oldest), remembered in the cookie. Only for actions: cookies are writable there. */
export async function resolveClub(user: SessionUser): Promise<Ctx> {
  const club = pickClub(await listClubs(user.id), undefined);
  if (!club) throw new KelabError("NO_CLUB");
  await setClubCookie(club.id);
  return { userId: user.id, clubId: club.id, userName: user.name };
}

/**
 * Session user plus active club, resolved server-side for every action. Nothing here comes from the
 * request body. The club id in the cookie is a hint, never proof: it is used without a lookup of its
 * own because withClub checks membership in the same transaction as the operation (FORBIDDEN if it
 * is stale), and `act` then falls back to resolveClub. That keeps a normal action to one transaction.
 */
export async function requireCtx(): Promise<Ctx> {
  const user = await requireUser();
  const hint = (await cookies()).get(CLUB_COOKIE)?.value;
  if (hint && UUID.test(hint)) return { userId: user.id, clubId: hint, userName: user.name, fromCookie: true };
  return resolveClub(user);
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
