import { KutipanList } from "@/components/sections/kutipan";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kutipan KGK" };

export default function Page() {
  return <KutipanList />;
}
