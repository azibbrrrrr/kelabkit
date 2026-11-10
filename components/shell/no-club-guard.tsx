"use client";

import { Spinner } from "@/components/ui/spinner";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** A signed-in account without a club can only see /mula, where the club is created. */
export function NoClubGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onMula = pathname.startsWith("/mula");
  useEffect(() => {
    if (!onMula) router.replace("/mula/");
  }, [onMula, router]);
  if (!onMula)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  return <>{children}</>;
}
