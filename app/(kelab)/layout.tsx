import { NoClubGuard } from "@/components/shell/no-club-guard";
import { Workspace } from "@/components/shell/workspace";
import { getAppContext } from "@/lib/server/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

// Which backend the shell talks to is decided here, per request, from the kk_mode cookie and
// the Neon Auth session. Reading them makes these routes dynamic.
export const dynamic = "force-dynamic";

export default async function KelabLayout({ children }: { children: ReactNode }) {
  const context = await getAppContext();
  if (context.mode === "signed-out") redirect("/masuk/");
  if (context.mode === "demo") return <Workspace>{children}</Workspace>;
  const { name, email, image } = context.user;
  // First sign-in: no club yet, so only /mula (club creation) renders, without the data shell.
  if (!context.hasClub) return <NoClubGuard>{children}</NoClubGuard>;
  return <Workspace user={{ name, email, image }}>{children}</Workspace>;
}
