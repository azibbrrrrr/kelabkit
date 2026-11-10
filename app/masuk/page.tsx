import { SignInPage } from "@/components/sections/masuk";
import { getAppContext } from "@/lib/server/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Log masuk" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if ((await getAppContext()).mode === "neon") redirect("/");
  return <SignInPage />;
}
