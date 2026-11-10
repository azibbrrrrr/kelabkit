"use client";

import { BrandMark } from "@/components/brand";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { Blossom } from "@/components/floral";
import { ChoiceCard, ChoiceCards } from "@/components/choice";
import { usePrefs } from "@/components/prefs-provider";
import { DemoNote, Money, PageHeader, PageShell, ProgressBar, SectionCard } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { themes, type ThemeId } from "@/lib/themes";
import type { Club } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Database, History, Palette, Plus, RotateCcw, School } from "lucide-react";
import Link from "next/link";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

export function SettingsPage() {
  const { data } = useSnapshot();
  return (
    <PageShell>
      <PageHeader title="Tetapan" description="Maklumat kelab, tema paparan dan rekod perubahan." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-5">
          {/* Re-mounts after a save or reset so the form shows what is stored. */}
          <ClubForm key={`${data.club.name}|${data.club.school}|${data.club.session}|${data.club.treasurerName}`} club={data.club} />
          <DemoDataCard />
        </div>
        <ThemeCard />
      </div>
      <AuditLog />
    </PageShell>
  );
}

// Maklumat kelab --------------------------------------------------------------------------

type ClubFields = { name: string; school: string; session: string; treasurerName: string };

function validate(fields: ClubFields) {
  const errors: Partial<Record<keyof ClubFields, string>> = {};
  if (!fields.name.trim()) errors.name = "Nama kelab diperlukan.";
  else if (fields.name.trim().length > 120) errors.name = "Nama terlalu panjang (maksimum 120 aksara).";
  if (fields.school.trim().length > 120) errors.school = "Nama sekolah terlalu panjang (maksimum 120 aksara).";
  if (!fields.session.trim()) errors.session = "Sesi diperlukan, contohnya 2026.";
  else if (fields.session.trim().length > 40) errors.session = "Sesi terlalu panjang (maksimum 40 aksara).";
  if (!fields.treasurerName.trim()) errors.treasurerName = "Nama bendahari diperlukan.";
  else if (fields.treasurerName.trim().length > 120) errors.treasurerName = "Nama terlalu panjang (maksimum 120 aksara).";
  return errors;
}

function ClubForm({ club }: { club: Club }) {
  const { run } = useKelab();
  const initial: ClubFields = { name: club.name, school: club.school ?? "", session: club.session, treasurerName: club.treasurerName };
  const [fields, setFields] = useState(initial);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
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
    const found = validate(fields);
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
      toast.success("Maklumat kelab disimpan.");
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
        {optional && <span className="font-normal text-muted-foreground"> (pilihan)</span>}
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
    <SectionCard title="Maklumat kelab" icon={School} description="Dipaparkan pada laporan dan ditandatangani dalam mesej peringatan.">
      <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
        {field("name", "Nama kelab", "Contoh: KGK SK Taman Melati")}
        {field("school", "Sekolah", "Contoh: SK Taman Melati", true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("session", "Sesi", "Contoh: 2026")}
          {field("treasurerName", "Nama bendahari", "Contoh: Cikgu Aina Sofea")}
        </div>
        {formError && <p className="text-xs font-medium text-st-unpaid">{formError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !dirty}>
            {busy && <Spinner className="size-4" />}
            Simpan
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
              Batal perubahan
            </Button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

// Tema ------------------------------------------------------------------------------------

function ThemeCard() {
  const { theme, floral, setPrefs } = usePrefs();
  const { data, view } = useSnapshot();
  const floralId = useId();
  const current = themes.find((t) => t.id === theme) ?? themes[0];

  // The preview uses the same totals as the rest of the app: active collections only,
  // confirmed money only (charges plus voluntary contributions).
  const figures = useMemo(() => {
    const active = data.collections.filter((c) => c.status === "active");
    const totals = active.map((c) => view.collectionTotals(c.id));
    const expected = sum(totals.map((t) => t.expected));
    const chargesReceived = sum(totals.map((t) => t.received));
    return { expected, chargesReceived, received: chargesReceived + sum(totals.map((t) => t.voluntary)) };
  }, [data.collections, view]);

  const choose = (id: ThemeId) => setPrefs({ theme: id });

  return (
    <SectionCard title="Tema KelabKit" icon={Palette} description="Tema hanya menukar warna paparan. Rekod bayaran tidak terjejas.">
      <div className="grid gap-5">
        <RadioGroup value={theme} onValueChange={(id) => choose(id as ThemeId)} aria-label="Tema warna" className="flex w-auto flex-wrap gap-x-3 gap-y-3 sm:gap-x-5">
          {themes.map((t) => {
            const selected = t.id === theme;
            return (
              <RadioGroupPrimitive.Item
                key={t.id}
                value={t.id}
                className="group flex w-14 flex-col items-center gap-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-full text-white transition-shadow",
                    selected ? "ring-3 ring-offset-2 ring-offset-card" : "group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-card",
                  )}
                  // Theme colours are defined once in lib/themes.ts. The circle uses the AA fill so the
                  // white check keeps 3:1; the row swatch below shows the reference accent.
                  style={{ backgroundColor: t.fill, ["--tw-ring-color" as string]: `color-mix(in srgb, ${t.fill} 45%, transparent)` }}
                >
                  {selected && <Check className="size-5" strokeWidth={2.6} aria-hidden />}
                </span>
                <span className={cn("text-xs", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>{t.label}</span>
              </RadioGroupPrimitive.Item>
            );
          })}
        </RadioGroup>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-primary-tint/50 px-3.5 py-3">
          <Label htmlFor={floralId} className="grid gap-0.5">
            <span className="text-sm font-medium">Paparkan hiasan bunga</span>
            <span className="text-xs font-normal text-muted-foreground">Hiasan bunga sakura di tepi skrin. Matikan untuk paparan yang lebih ringkas.</span>
          </Label>
          <Switch id={floralId} checked={floral} onCheckedChange={(checked) => setPrefs({ floral: checked })} />
        </div>

        <div aria-label="Pratonton tema" className="relative overflow-hidden rounded-2xl border border-border bg-primary-tint p-3.5 sm:p-4">
          <Blossom className="absolute -top-1 right-24 size-8 opacity-70 sm:right-28" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span className="font-display text-[15px] font-bold">KelabKit</span>
            </span>
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </div>
          <div className="rounded-xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
            <p className="text-xs text-muted-foreground">Jumlah Telah Diterima</p>
            <Money sen={figures.received} className="mt-1 block text-[22px] font-bold tracking-[-.015em]" />
            <ProgressBar value={figures.chargesReceived} max={figures.expected} className="mt-3" label="Peratus kutipan diterima" />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {formatPercent(figures.chargesReceived, figures.expected)} daripada jumlah dijangka bagi kutipan aktif
            </p>
            <Button asChild className="mt-3 w-full">
              <Link href="/bayaran/baru/">
                <Plus /> Rekod Bayaran
              </Link>
            </Button>
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Pratonton tema {current.label} menggunakan data sebenar anda. Pilihan tema disimpan dalam pelayar ini sahaja.
        </p>

        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Semua tema</p>
          <ChoiceCards label="Senarai tema" value={theme} onChange={(id) => choose(id as ThemeId)} className="grid gap-2">
            {themes.map((t) => {
              const selected = t.id === theme;
              return (
                <ChoiceCard key={t.id} value={t.id} checked={selected} className="min-h-0 items-center rounded-xl px-3 py-2.5 text-foreground">
                  <span className="size-8 shrink-0 rounded-lg" style={{ backgroundColor: t.swatch }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t.label}
                      {t.id === "rose" && <span className="font-normal text-muted-foreground"> (lalai)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t.mood}</span>
                  </span>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      selected ? "border-transparent bg-primary-fill text-primary-foreground" : "border-input bg-card",
                    )}
                    aria-hidden
                  >
                    {selected && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </ChoiceCard>
              );
            })}
          </ChoiceCards>
        </div>
      </div>
    </SectionCard>
  );
}

// Data demo -------------------------------------------------------------------------------

function DemoDataCard() {
  const { demo, run } = useKelab();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!demo) return null;

  const reset = async () => {
    setBusy(true);
    try {
      await run((backend) => backend.resetDemo());
      toast.success("Data demo telah dipulihkan kepada asal.");
      setOpen(false);
    } catch (cause) {
      toast.error(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Data demo" icon={Database} description="Prototaip ini belum bersambung ke pelayan.">
      <div className="grid gap-3">
        <DemoNote>
          Semua ahli, kutipan dan bayaran disimpan dalam pelayar ini sahaja. Ia tidak dikongsi dengan peranti lain dan hilang jika data pelayar dipadam.
        </DemoNote>
        <p className="text-xs text-muted-foreground">
          Set semula memadam semua perubahan anda dan memulihkan data contoh asal. Pilihan tema dan hiasan bunga tidak terjejas.
        </p>
        <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
          <AlertDialogTrigger asChild>
            <Button variant="danger-outline" className="w-fit">
              <RotateCcw /> Set semula data demo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Set semula data demo?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua ahli, kutipan, bayaran dan log audit yang anda tambah atau ubah dalam pelayar ini akan dipadam dan diganti dengan data contoh asal. Tindakan ini tidak boleh dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={(event) => {
                  // Keep the dialog open until the reset finishes.
                  event.preventDefault();
                  void reset();
                }}
              >
                {busy && <Spinner className="size-4" />}
                Ya, set semula
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SectionCard>
  );
}

// Log audit -------------------------------------------------------------------------------

const PAGE = 15;

function AuditLog() {
  const { data } = useSnapshot();
  const [shown, setShown] = useState(PAGE);
  const entries = useMemo(() => [...data.audit].sort((a, b) => b.at.localeCompare(a.at)), [data.audit]);
  const visible = entries.slice(0, shown);

  return (
    <SectionCard title="Log audit" icon={History} description="Setiap perubahan direkod bersama masa, pelaku dan sebab. Log tidak boleh diubah.">
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada perubahan direkod.</p>
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
                  {entry.reason && <p className="mt-0.5 text-xs break-words text-muted-foreground">Sebab: {entry.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Memaparkan {visible.length} daripada {entries.length} rekod
            </p>
            {shown < entries.length && (
              <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Tunjuk lagi
              </Button>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
