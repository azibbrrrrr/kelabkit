import { SettingsPage } from "@/components/sections/tetapan";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tetapan" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.settings" />
      <SettingsPage />
    </>
  );
}
