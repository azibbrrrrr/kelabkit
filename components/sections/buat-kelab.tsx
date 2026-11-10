"use client";

import { BrandMark } from "@/components/brand";
import { Floral } from "@/components/floral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { createClub } from "@/app/actions/club";
import { errorMessages } from "@/lib/errors";
import { useT } from "@/lib/i18n/react";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

/** First sign-in with no club: creates the club (and the owner membership) and nothing else. */
export function CreateClubPage({ defaultTreasurer }: { defaultTreasurer: string }) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState("");
  const [session, setSession] = useState(String(new Date().getFullYear()));
  const [school, setSchool] = useState("");
  const [treasurer, setTreasurer] = useState(defaultTreasurer);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(errorMessages.NAME_REQUIRED);
    if (name.trim().length > 120) return setError(errorMessages.NAME_TOO_LONG);
    if (!session.trim()) return setError(errorMessages.SESSION_REQUIRED);
    setBusy(true);
    setError(null);
    try {
      const result = await createClub({ name, session, school: school.trim() || null, treasurerName: treasurer.trim() || null });
      if (!result.ok) {
        setError(errorMessages[result.code]);
        setBusy(false);
        return;
      }
      // A full navigation: the shell is chosen on the server and now has a club to load.
      window.location.assign("/");
    } catch {
      setError(errorMessages.NETWORK);
      setBusy(false);
    }
  };

  return (
    <main className="page-glow relative isolate grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center overflow-hidden px-4 py-10">
      <Floral asset="corner-top-right" className="top-0 right-0 z-0 w-[220px] opacity-80 sm:w-[300px]" />
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="relative z-10 grid w-full max-w-[460px] gap-4 rounded-3xl border border-border bg-card p-6 shadow-[0_12px_40px_-24px_var(--primary)] sm:p-8"
      >
        <div className="flex items-start gap-3">
          <BrandMark size="lg" />
          <div>
            <h1 className="font-display text-h1 tracking-[-.02em]">{t("auth.createClubTitle")}</h1>
            <p className="mt-1 text-small text-muted-foreground">{t("auth.createClubHint")}</p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>{t("auth.clubName")}</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.clubNamePlaceholder")} className="h-10 rounded-xl" autoComplete="off" />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-school`}>{t("auth.school")}</Label>
            <Input id={`${id}-school`} value={school} onChange={(e) => setSchool(e.target.value)} placeholder={t("auth.schoolPlaceholder")} className="h-10 rounded-xl" autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-session`}>{t("auth.session")}</Label>
            <Input id={`${id}-session`} value={session} onChange={(e) => setSession(e.target.value)} inputMode="numeric" className="h-10 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-treasurer`}>{t("auth.treasurerName")}</Label>
          <Input id={`${id}-treasurer`} value={treasurer} onChange={(e) => setTreasurer(e.target.value)} className="h-10 rounded-xl" autoComplete="name" />
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-st-unpaid">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-11 rounded-xl">
          {busy && <Spinner className="size-4" />}
          {t("auth.createClub")} <ArrowRight />
        </Button>
      </form>
    </main>
  );
}
