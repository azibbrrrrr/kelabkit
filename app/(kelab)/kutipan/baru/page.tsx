import { KutipanWizard } from "@/components/sections/kutipan-wizard";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tambah Kutipan" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.newCollection" />
      <KutipanWizard />
    </>
  );
}
