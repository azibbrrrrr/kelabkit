import { AhliPage } from "@/components/sections/ahli";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ahli" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.members" />
      <AhliPage />
    </>
  );
}
