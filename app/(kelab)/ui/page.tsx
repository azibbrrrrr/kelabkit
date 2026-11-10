import { DesignSystemPage } from "@/components/sections/design-system";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sistem Reka Bentuk" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.designSystem" />
      <DesignSystemPage />
    </>
  );
}
