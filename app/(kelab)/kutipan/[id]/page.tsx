import { KutipanDetail } from "@/components/sections/kutipan-detail";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Butiran Kutipan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <DocumentTitle k="brand.docTitle.collectionDetail" />
      <KutipanDetail id={id} />
    </>
  );
}
