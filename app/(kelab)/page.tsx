import { Dashboard } from "@/components/sections/dashboard";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Papan Pemuka" };

export default function DashboardPage() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.dashboard" />
      <Dashboard />
    </>
  );
}
