import { ReportsPage } from "@/components/sections/laporan";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Laporan" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.reports" />
      <ReportsPage />
    </>
  );
}
