import { KutipanDetail } from "@/components/sections/kutipan-detail";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Butiran Kutipan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KutipanDetail id={id} />;
}
