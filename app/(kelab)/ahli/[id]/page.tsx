import { AhliDetail } from "@/components/sections/ahli-detail";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Butiran ahli" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AhliDetail id={id} />;
}
