import { BayaranPage } from "@/components/sections/bayaran";
import { PageShell, TableSkeleton } from "@/components/shared";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Rekod Bayaran" };

export default function Page() {
  // The tab lives in ?tab=, read with useSearchParams, which needs a Suspense boundary.
  return (
    <>
      <DocumentTitle k="brand.docTitle.payments" />
      <Suspense
        fallback={
          <PageShell>
            <TableSkeleton />
          </PageShell>
        }
      >
        <BayaranPage />
      </Suspense>
    </>
  );
}
