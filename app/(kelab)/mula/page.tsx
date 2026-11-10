import { CreateClubPage } from "@/components/sections/buat-kelab";
import { OnboardingPage } from "@/components/sections/mula";
import { DocumentTitle } from "@/components/document-title";
import { getAppContext } from "@/lib/server/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mula" };

export default async function Page() {
  const context = await getAppContext();
  if (context.mode === "neon" && !context.hasClub) return <CreateClubPage defaultTreasurer={context.user.name} />;
  return (
    <>
      <DocumentTitle k="brand.docTitle.start" />
      <OnboardingPage />
    </>
  );
}
