import { KutipanWizard } from "@/components/sections/kutipan-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tambah Kutipan" };

export default function Page() {
  return <KutipanWizard />;
}
