"use client";

import { BrandMark } from "@/components/brand";
import { ModalBody, ModalFooter, ModalHeader, ModalText } from "@/components/modal";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { Blossom } from "@/components/floral";
import { usePrefs } from "@/components/prefs-provider";
import { DemoNote, Money, PageHeader, PageShell, ProgressBar, SectionCard } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { messageFor } from "@/lib/errors";
import { formatDateTime, formatPercent } from "@/lib/format";
import { auditActionLabels } from "@/lib/labels";
import { sum } from "@/lib/money/amount";
import { LanguagePill } from "@/components/language-pill";
import { useT, type TFunction } from "@/lib/i18n/react";
import { themeLabel, themes, type ThemeId } from "@/lib/themes";
import type { Club } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Database, History, Languages, Palette, Plus, RotateCcw, School } from "lucide-react";
import Link from "next/link";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

export function SettingsPage() {
  const t = useT();
  const { data } = useSnapshot();
  return (
    <PageShell>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-5">
          {/* Re-mounts after a save or reset so the form shows what is stored. */}
          <ClubForm key={`${data.club.name}|${data.club.school}|${data.club.session}|${data.club.treasurerName}`} club={data.club} />
          <DemoDataCard />
        </div>
        <div className="grid min-w-0 gap-5">
          <LanguageCard />
          <ThemeCard />
        </div>
      </div>
      <AuditLog />
    </PageShell>
  );
}

function LanguageCard() {
  const t = useT();
  return (
    <SectionCard title={t("lang.settingsTitle")} icon={Languages} description={t("lang.settingsDescription")}>
      <LanguagePill placement="settings" />
    </SectionCard>
  );
}

// Maklumat kelab --------------------------------------------------------------------------

type ClubFields = { name: string; school: string; session: string; treasurerName: string };

function validate(fields: ClubFields, t: TFunction) {
  const errors: Partial<Record<keyof ClubFields, string>> = {};
  if (!fields.name.trim()) errors.name = t("settings.club.errors.nameRequired");
  else if (fields.name.trim().length > 120) errors.name = t("settings.club.errors.nameTooLong");
  if (fields.school.trim().length > 120) errors.school = t("settings.club.errors.schoolTooLong");
  if (!fields.session.trim()) errors.session = t("settings.club.errors.sessionRequired");
  else if (fields.session.trim().length > 40) errors.session = t("settings.club.errors.sessionTooLong");
  if (!fields.treasurerName.trim()) errors.treasurerName = t("settings.club.errors.treasurerRequired");
  else if (fields.treasurerName.trim().length > 120) errors.treasurerName = t("settings.club.errors.treasurerTooLong");
  return errors;
}

function ClubForm({ club }: { club: Club }) {
  const t = useT();
  const { run } = useKelab();
  const initial: ClubFields = { name: club.name, school: club.school ?? "", session: club.session, treasurerName: club.treasurerName };
  const [fields, setFields] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ClubFields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const dirty = (Object.keys(initial) as (keyof ClubFields)[]).some((key) => fields[key].trim() !== initial[key].trim());

  const set = (key: keyof ClubFields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(fields, t);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await run((backend) =>
        backend.updateClub({
          name: fields.name.trim(),
          school: fields.school.trim() || null,
          session: fields.session.trim(),
          treasurerName: fields.treasurerName.trim(),
        }),
      );
      toast.success(t("settings.club.saved"));
    } catch (cause) {
      setFormError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof ClubFields, label: string, placeholder: string, optional = false) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${key}`}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> {t("settings.club.optional")}</span>}
      </Label>
      <Input
        id={`${id}-${key}`}
        value={fields[key]}
        onChange={set(key)}
        placeholder={placeholder}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} className="text-xs font-medium text-st-unpaid">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <SectionCard title={t("settings.club.title")} icon={School} description={t("settings.club.description")}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
        {field("name", t("settings.club.name"), t("settings.club.namePlaceholder"))}
        {field("school", t("settings.club.school"), t("settings.club.schoolPlaceholder"), true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("session", t("settings.club.session"), t("settings.club.sessionPlaceholder"))}
          {field("treasurerName", t("settings.club.treasurer"), t("settings.club.treasurerPlaceholder"))}
        </div>
        {formError && <p className="text-xs font-medium text-st-unpaid">{formError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !dirty}>
            {busy && <Spinner className="size-4" />}
            {t("common.save")}
          </Button>
          {dirty && !busy && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFields(initial);
                setErrors({});
                setFormError(null);
              }}
            >
              {t("settings.club.discard")}
            </Button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

// Tema ------------------------------------------------------------------------------------

function ThemeCard() {
  const t = useT();
  const { theme, floral, setPrefs } = usePrefs();
  const { data, view } = useSnapshot();
  const floralId = useId();
  const current = themes.find((th) => th.id === theme) ?? themes[0];

  // The preview uses the same totals as the rest of the app: active collections only,
  // confirmed money only (charges plus voluntary contributions).
  const figures = useMemo(() => {
    const active = data.collections.filter((c) => c.status === "active");
    const totals = active.map((c) => view.collectionTotals(c.id));
    const expected = sum(totals.map((x) => x.expected));
    const chargesReceived = sum(totals.map((x) => x.received));
    return { expected, chargesReceived, received: chargesReceived + sum(totals.map((x) => x.voluntary)) };
  }, [data.collections, view]);

  const choose = (id: ThemeId) => setPrefs({ theme: id });

  return (
    <SectionCard title={t("settings.theme.title")} icon={Palette} description={t("settings.theme.description")}>
      <div className="grid gap-5">
        <RadioGroup value={theme} onValueChange={(id) => choose(id as ThemeId)} aria-label={t("settings.theme.colorLabel")} className="flex w-auto flex-wrap gap-x-3 gap-y-3 sm:gap-x-5">
          {themes.map((th) => {
            const selected = th.id === theme;
            return (
              <RadioGroupPrimitive.Item
                key={th.id}
                value={th.id}
                className="group flex w-14 flex-col items-center gap-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-full text-white transition-shadow",
                    selected ? "ring-3 ring-offset-2 ring-offset-card" : "group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-card",
                  )}
                  // Theme colours are defined once in lib/themes.ts. The circle uses the AA fill so the
                  // white check keeps 3:1; the row swatch below shows the reference accent.
                  style={{ backgroundColor: th.fill, ["--tw-ring-color" as string]: `color-mix(in srgb, ${th.fill} 45%, transparent)` }}
                >
                  {selected && <Check className="size-5" strokeWidth={2.6} aria-hidden />}
                </span>
                <span className={cn("text-xs", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>{themeLabel(th.id)}</span>
              </RadioGroupPrimitive.Item>
            );
          })}
        </RadioGroup>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-primary-tint/50 px-3.5 py-3">
          <Label htmlFor={floralId} className="grid gap-0.5">
            <span className="text-sm font-medium">{t("settings.theme.floralTitle")}</span>
            <span className="text-xs font-normal text-muted-foreground">{t("settings.theme.floralHint")}</span>
          </Label>
          <Switch id={floralId} checked={floral} onCheckedChange={(checked) => setPrefs({ floral: checked })} />
        </div>

        <div aria-label={t("settings.theme.previewLabel")} className="relative overflow-hidden rounded-2xl border border-border bg-primary-tint p-3.5 sm:p-4">
          <Blossom className="absolute -top-1 right-24 size-8 opacity-70 sm:right-28" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span className="font-display text-h3 font-bold">KelabKit</span>
            </span>
            <span className="text-xs text-muted-foreground">{t("settings.theme.previewPage")}</span>
          </div>
          <div className="rounded-xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
            <p className="text-xs text-muted-foreground">{t("settings.theme.previewReceived")}</p>
            <Money sen={figures.received} className="mt-1 block text-figure tracking-[-.015em]" />
            <ProgressBar value={figures.chargesReceived} max={figures.expected} className="mt-3" label={t("settings.theme.previewProgress")} />
            <p className="mt-1.5 text-caption text-muted-foreground">
              {t("settings.theme.previewPercentOf", { percent: formatPercent(figures.chargesReceived, figures.expected) })}
            </p>
            <Button asChild className="mt-3 w-full">
              <Link href="/bayaran/baru/">
                <Plus /> {t("nav.payments")}
              </Link>
            </Button>
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("settings.theme.previewNote", { theme: themeLabel(current.id) })}
        </p>

      </div>
    </SectionCard>
  );
}

// Data demo -------------------------------------------------------------------------------

function DemoDataCard() {
  const t = useT();
  const { demo, run } = useKelab();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!demo) return null;

  const reset = async () => {
    setBusy(true);
    try {
      await run((backend) => backend.resetDemo());
      toast.success(t("settings.demo.resetDone"));
      setOpen(false);
    } catch (cause) {
      toast.error(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={t("settings.demo.title")} icon={Database} description={t("settings.demo.description")}>
      <div className="grid gap-3">
        <DemoNote>
          {t("settings.demo.note")}
        </DemoNote>
        <p className="text-xs text-muted-foreground">
          {t("settings.demo.resetNote")}
        </p>
        <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
          <AlertDialogTrigger asChild>
            <Button variant="danger-outline" className="w-fit">
              <RotateCcw /> {t("settings.demo.resetButton")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <ModalHeader alert icon={RotateCcw} tone="danger" title={t("settings.demo.resetTitle")} />
            <ModalBody>
              <ModalText alert>
                {t("settings.demo.resetWarning")}
              </ModalText>
            </ModalBody>
            <ModalFooter>
              <AlertDialogCancel variant="ghost" disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                disabled={busy}
                onClick={(event) => {
                  // Keep the dialog open until the reset finishes.
                  event.preventDefault();
                  void reset();
                }}
              >
                {busy && <Spinner className="size-4" />}
                {t("settings.demo.resetConfirm")}
              </AlertDialogAction>
            </ModalFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SectionCard>
  );
}

// Log audit -------------------------------------------------------------------------------

const PAGE = 15;

function AuditLog() {
  const t = useT();
  const { data } = useSnapshot();
  const [shown, setShown] = useState(PAGE);
  const entries = useMemo(() => [...data.audit].sort((a, b) => b.at.localeCompare(a.at)), [data.audit]);
  const visible = entries.slice(0, shown);

  return (
    <SectionCard title={t("settings.audit.title")} icon={History} description={t("settings.audit.description")}>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("settings.audit.empty")}</p>
      ) : (
        <div className="grid gap-3">
          <ol className="grid divide-y divide-border rounded-xl border border-border">
            {visible.map((entry) => (
              <li key={entry.id} className="grid gap-1 px-3.5 py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
                <div className="text-xs text-muted-foreground">
                  <time dateTime={entry.at} className="block tabular-nums">
                    {formatDateTime(entry.at)}
                  </time>
                  <span className="block break-words">{entry.actor}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary-strong">{auditActionLabels[entry.action] ?? entry.action}</p>
                  <p className="text-sm break-words">{entry.summary}</p>
                  {entry.reason && <p className="mt-0.5 text-xs break-words text-muted-foreground">{t("settings.audit.reason", { reason: entry.reason })}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("settings.audit.showing", { shown: visible.length, total: entries.length })}
            </p>
            {shown < entries.length && (
              <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                {t("settings.audit.more")}
              </Button>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
