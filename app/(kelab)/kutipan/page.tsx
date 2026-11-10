import { KutipanList } from "@/components/sections/kutipan";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kutipan KGK" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.collections" />
      <KutipanList />
    </>
  );
}
