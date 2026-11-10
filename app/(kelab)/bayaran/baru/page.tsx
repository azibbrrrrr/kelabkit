import { BayaranBaru } from "@/components/sections/bayaran-baru";
import { PageShell, TableSkeleton } from "@/components/shared";
import { DocumentTitle } from "@/components/document-title";
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
      <DocumentTitle k="brand.docTitle.newPayment" />
      <BayaranBaru />
    </Suspense>
  );
}
