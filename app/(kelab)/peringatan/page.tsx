import { RemindersPage } from "@/components/sections/peringatan";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Peringatan" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.reminders" />
      <RemindersPage />
    </>
  );
}
