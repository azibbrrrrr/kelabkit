import { BayaranBaru } from "@/components/sections/bayaran-baru";
import { PageShell, TableSkeleton } from "@/components/shared";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Rekod Bayaran" };

export default function Page() {
  // ?ahli=<id> preselects a member; useSearchParams needs a Suspense boundary.
  return (
    <Suspense
      fallback={
        <PageShell>
          <TableSkeleton />
        </PageShell>
      }
    >
      <BayaranBaru />
    </Suspense>
  );
}
