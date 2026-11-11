import { AhliPage } from "@/components/sections/ahli";
import { DocumentTitle } from "@/components/document-title";
import { AhliSkeleton } from "@/components/skeletons/pages";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Ahli" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.members" />
      {/* The sort lives in ?isih=, read with useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<AhliSkeleton />}>
        <AhliPage />
      </Suspense>
    </>
  );
}
