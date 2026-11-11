import { Dashboard } from "@/components/sections/dashboard";
import { DocumentTitle } from "@/components/document-title";
import { DashboardSkeleton } from "@/components/skeletons/pages";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Papan Pemuka" };

export default function DashboardPage() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.dashboard" />
      {/* The period lives in ?tempoh=, read with useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}
