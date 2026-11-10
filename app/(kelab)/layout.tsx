import { NoClubGuard } from "@/components/shell/no-club-guard";
import { Workspace } from "@/components/shell/workspace";
import { ShellSkeleton } from "@/components/skeletons/shell";
import { getAppContext } from "@/lib/server/session";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

// Which backend the shell talks to is decided here, per request, from the kk_mode cookie and
// the Neon Auth session. Reading them makes these routes dynamic.
export const dynamic = "force-dynamic";

/** The session and club lookup is the slow part of a first load: it streams behind a shell-shaped skeleton. */
export default function KelabLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const context = await getAppContext();
  if (context.mode === "signed-out" || context.mode === "unconfigured") redirect("/masuk/");
  if (context.mode === "demo") return <Workspace>{children}</Workspace>;
  const { name, email, image } = context.user;
  // First sign-in: no club yet, so only /mula (club creation) renders, without the data shell.
  if (!context.hasClub) return <NoClubGuard>{children}</NoClubGuard>;
  return <Workspace user={{ name, email, image }}>{children}</Workspace>;
}
