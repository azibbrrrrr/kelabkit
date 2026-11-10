import { MatrixPage } from "@/components/matrix/matrix";
import { DocumentTitle } from "@/components/document-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Matriks Kutipan" };

export default function Page() {
  return (
    <>
      <DocumentTitle k="brand.docTitle.matrix" />
      <MatrixPage />
    </>
  );
}
