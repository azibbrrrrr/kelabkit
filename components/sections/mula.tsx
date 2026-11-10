"use client";

import { BrandMark } from "@/components/brand";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { Blossom, Floral } from "@/components/floral";
import { DemoNote, PageShell, ProgressBar, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { KelabError, messageFor } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import type { Club } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, CircleDashed, ListChecks, ReceiptText, Sheet, UsersRound, WalletCards, School } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

// First-time setup, as a prototype over the demo data: each step uses the real backend,
// adds to what is there and never wipes it. Progress comes from the stored data, not
// from which buttons were clicked.

type Step = 1 | 2 | 3 | 4 | 5;

export function OnboardingPage() {
  const t = useT();
  const { data } = useSnapshot();
  const { demo } = useKelab();
  const [step, setStep] = useState<Step>(1);

  const checks = [
    { label: t("start.checks.club"), done: data.club.name.trim().length > 0, step: 1 as Step },
    { label: t("start.checks.members"), done: data.members.length > 0, step: 2 as Step },
    { label: t("start.checks.collection"), done: data.collections.length > 0, step: 3 as Step },
    { label: t("start.checks.payment"), done: data.payments.some((p) => p.state !== "reversed"), step: 4 as Step },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const doneFor = (s: Step) => checks.find((c) => c.step === s)?.done ?? false;
  const next = (s: Step) => setStep(Math.min(5, s + 1) as Step);

  return (
    <PageShell className="max-w-[1080px]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-7">
        <Floral asset="header-spray" className="-top-4 -right-6 hidden w-[240px] opacity-80 sm:block" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <BrandMark size="lg" />
          <div className="min-w-0 sm:max-w-[70%]">
            <h1 className="font-display text-[24px] leading-[1.2] font-bold tracking-[-.02em] md:text-[28px]">
              {t("start.hero.title")} <Blossom />
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t("start.hero.subtitle")}
            </p>
          </div>
        </div>
        {demo && (
          <div className="relative mt-4">
            <DemoNote>
              {t("start.hero.demoBefore")}
              <Link href="/tetapan/" className="font-medium text-primary-strong underline-offset-2 hover:underline">
                {t("start.hero.demoLink")}
              </Link>
              {t("start.hero.demoAfter")}
            </DemoNote>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <ol className="grid gap-3">
          <StepCard n={1} title={t("start.steps.club")} icon={School} active={step === 1} done={doneFor(1)} onOpen={() => setStep(1)}>
            <ClubStep key={`${data.club.name}|${data.club.session}`} club={data.club} onDone={() => next(1)} />
          </StepCard>
          <StepCard n={2} title={t("start.steps.members")} icon={UsersRound} active={step === 2} done={doneFor(2)} onOpen={() => setStep(2)}>
            <MembersStep count={data.members.length} onDone={() => next(2)} />
          </StepCard>
          <StepCard n={3} title={t("start.steps.collection")} icon={WalletCards} active={step === 3} done={doneFor(3)} onOpen={() => setStep(3)}>
            <LinkStep
              text={t("start.steps.collectionText")}
              href="/kutipan/baru/"
              label={t("start.steps.collectionCta")}
              onNext={() => next(3)}
            />
          </StepCard>
          <StepCard n={4} title={t("start.steps.payment")} icon={ReceiptText} active={step === 4} done={doneFor(4)} onOpen={() => setStep(4)}>
            <LinkStep
              text={t("start.steps.paymentText")}
              href="/bayaran/baru/"
              label={t("start.steps.paymentCta")}
              onNext={() => next(4)}
            />
          </StepCard>
          <StepCard n={5} title={t("start.steps.status")} icon={Sheet} active={step === 5} done={false} onOpen={() => setStep(5)}>
            <LinkStep text={t("start.steps.statusText")} href="/matriks/" label={t("start.steps.statusCta")} />
          </StepCard>
        </ol>

        <SectionCard title={t("start.progress.title")} icon={ListChecks} description={t("start.progress.description")} className="lg:sticky lg:top-20">
          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[22px] font-bold tabular-nums">
                {doneCount}/{checks.length}
              </span>
              <span className="text-xs text-muted-foreground">{doneCount === checks.length ? t("start.progress.ready") : t("start.progress.incomplete")}</span>
            </div>
            <ProgressBar value={doneCount} max={checks.length} label={t("start.progress.barLabel")} />
            <ul className="grid gap-1">
              {checks.map((check) => (
                <li key={check.label}>
                  <Button
                    variant="ghost"
                    onClick={() => setStep(check.step)}
                    className="h-auto w-full justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left font-normal whitespace-normal hover:bg-primary-tint"
                  >
                    {check.done ? (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-st-paid-bg text-st-paid">
                        <Check className="size-3.5" strokeWidth={3} aria-hidden />
                      </span>
                    ) : (
                      <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn("min-w-0", check.done && "text-muted-foreground")}>{check.label}</span>
                    <span className="sr-only">{check.done ? t("start.progress.doneSr") : t("start.progress.todoSr")}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("start.progress.themeNote")}</p>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function StepCard({
  n,
  title,
  icon: Icon,
  active,
  done,
  onOpen,
  children,
}: {
  n: number;
  title: string;
  icon: typeof School;
  active: boolean;
  done: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const id = useId();
  return (
    <li className={cn("min-w-0 rounded-2xl border bg-card transition-colors", active ? "border-primary/50 shadow-[0_8px_24px_-18px_var(--primary)]" : "border-border")}>
      <Button
        variant="ghost"
        onClick={onOpen}
        aria-expanded={active}
        aria-controls={id}
        className="h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-normal whitespace-normal hover:bg-transparent aria-expanded:bg-transparent motion-safe:not-disabled:active:scale-100 md:px-5"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
            done ? "bg-st-paid-bg text-st-paid" : active ? "brand-gradient text-white" : "bg-primary-light text-primary-strong",
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} aria-label={t("start.steps.done")} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">{t("start.steps.label", { n })}</span>
          <span className="block font-semibold">{title}</span>
        </span>
        <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />
      </Button>
      {active && (
        <div id={id} className="px-4 pb-4 md:px-5 md:pb-5">
          {children}
        </div>
      )}
    </li>
  );
}

function ClubStep({ club, onDone }: { club: Club; onDone: () => void }) {
  const t = useT();
  const { run } = useKelab();
  const [name, setName] = useState(club.name);
  const [session, setSession] = useState(club.session);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("start.club.nameRequired"));
    if (name.trim().length > 120) return setError(t("start.club.nameTooLong"));
    if (!session.trim()) return setError(t("start.club.sessionRequired"));
    setError(null);
    if (name.trim() === club.name && session.trim() === club.session) return onDone();
    setBusy(true);
    try {
      await run((backend) => backend.updateClub({ name: name.trim(), session: session.trim() }));
      toast.success(t("start.club.saved"));
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3" noValidate>
      <p className="text-[13px] text-muted-foreground">{t("start.club.intro")}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>{t("start.club.nameLabel")}</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("start.club.namePlaceholder")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-session`}>{t("start.club.sessionLabel")}</Label>
          <Input id={`${id}-session`} value={session} onChange={(e) => setSession(e.target.value)} placeholder={t("start.club.sessionPlaceholder")} />
        </div>
      </div>
      {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {t("start.club.submit")} <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

/** One name per line; blank lines dropped and repeated names collapsed. */
function parseNames(text: string) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function MembersStep({ count, onDone }: { count: number; onDone: () => void }) {
  const t = useT();
  const { run } = useKelab();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const names = parseNames(text);

  const submit = async () => {
    if (!names.length) return setError(t("start.members.emptyError"));
    if (names.length > 300) return setError(t("start.members.tooMany"));
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.addMembers(names.map((name) => ({ name, category: null, phone: null, notes: null }))));
      toast.success(t("start.members.added", { count: formatNumber(names.length) }));
      setText("");
      setOpen(false);
      onDone();
    } catch (cause) {
      const detail = cause instanceof KelabError && cause.detail ? ` (${cause.detail})` : "";
      setError(`${messageFor(cause)}${detail} ${t("start.members.failedSuffix")}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        {t("start.members.intro", { count: formatNumber(count) })}
      </p>
      {open ? (
        <div className="grid gap-2">
          <Label htmlFor={id}>{t("start.members.label")}</Label>
          <Textarea
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            rows={6}
            placeholder={"Cikgu Aina Sofea\nPuan Rosnah Ahmad\nEncik Hafiz Rahman"}
            className="rounded-xl"
            aria-invalid={Boolean(error)}
          />
          <p className="text-xs text-muted-foreground">{names.length > 0 ? t("start.members.willAdd", { count: formatNumber(names.length) }) : t("start.members.pasteHint")}</p>
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submit()} disabled={busy || names.length === 0}>
              {busy && <Spinner className="size-4" />}
              {t("start.members.submit")}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)}>
            <UsersRound /> {t("start.members.open")}
          </Button>
          <Button variant="outline" onClick={onDone}>
            {t("start.members.skip")}
          </Button>
        </div>
      )}
    </div>
  );
}

function LinkStep({ text, href, label, onNext }: { text: string; href: string; label: string; onNext?: () => void }) {
  const t = useT();
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={href}>
            {label} <ArrowRight />
          </Link>
        </Button>
        {onNext && (
          <Button variant="outline" onClick={onNext}>
            {t("start.steps.next")}
          </Button>
        )}
      </div>
    </div>
  );
}
