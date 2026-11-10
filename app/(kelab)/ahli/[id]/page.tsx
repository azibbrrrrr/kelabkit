import { AhliDetail } from "@/components/sections/ahli-detail";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Butiran ahli" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <DocumentTitle k="brand.docTitle.memberDetail" />
      <AhliDetail id={id} />
    </>
  );
}
