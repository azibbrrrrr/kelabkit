"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { ChoiceCard, ChoiceCards } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MoneyInput, parseMoney } from "@/components/money-input";
import { MonthPicker } from "@/components/month-picker";
import { CollectionIcon, collectionTypeIcons } from "@/components/collection-icon";
import { EmojiPicker } from "@/components/emoji-picker";
import { DetailList, FilterPills, Money, PageHeader, PageShell, SearchInput, SectionCard, StatusChip, Toolbar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { NewParticipant } from "@/lib/backend/types";
import { errorMessages, messageFor } from "@/lib/errors";
import { formatDay, formatMoney, formatMonth, today } from "@/lib/format";
import { categoryLabels, collectionTypeLabels } from "@/lib/labels";
import { senToInput } from "@/lib/money/amount";
import { isMonth, monthOf, monthsBetween } from "@/lib/money/months";
import { suggestIcon } from "@/lib/collection-icon";
import { normaliseName } from "@/lib/names";
import type { CollectionType, Member, MemberCategory, Sen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, FileText, RotateCcw, Save, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// Tambah Kutipan: three steps that build one createCollection call. Client checks give
// early, specific messages; demo.createCollection repeats them (it is the authority) and
// its refusals are shown through messageFor. Nothing is written until the last click.

type Step = 0 | 1 | 2;
type CategoryFilter = "all" | MemberCategory | "none";

const steps: { title: string; hint: string }[] = [
  { title: "Butiran Kutipan", hint: "Nama, jenis dan amaun" },
  { title: "Pilih Ahli", hint: "Siapa yang terlibat" },
  { title: "Semak & Cipta", hint: "Sahkan sebelum simpan" },
];

const typeHints: Record<CollectionType, string> = {
  one_off: "Satu amaun untuk setiap ahli, cth. jamuan atau baju.",
  monthly: "Caj berasingan setiap bulan, cth. yuran KGK.",
  voluntary: "Ahli menyumbang ikut kemampuan. Tiada hutang.",
};

type Details = {
  name: string;
  type: CollectionType;
  amount: string;
  dueDate: string;
  startMonth: string;
  endMonth: string;
  dueDay: string;
  description: string;
  notes: string;
  /** The treasurer's pick: an icon, null for none. Absent until they pick, so the name's suggestion applies. */
  icon?: string | null;
};

/** The icon the collection will get: the treasurer's pick, else one suggested from the name. */
function iconOf(details: Details) {
  return details.icon !== undefined ? details.icon : suggestIcon(details.name);
}

type DetailErrors = Partial<Record<"name" | "amount" | "months" | "dueDay", string>>;
type Exemption = { on: boolean; reason: string };

export function KutipanWizard() {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const router = useRouter();
  const thisMonth = monthOf(today());

  const initial = useMemo<Details>(
    () => ({
      name: "",
      type: "one_off",
      amount: "",
      dueDate: "",
      startMonth: thisMonth,
      endMonth: `${thisMonth.slice(0, 4)}-12`,
      dueDay: "10",
      description: "",
      notes: "",
    }),
    [thisMonth],
  );

  const activeMembers = useMemo(
    () => data.members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name, "ms")),
    [data.members],
  );

  const [step, setStep] = useState<Step>(0);
  const [details, setDetails] = useState<Details>(initial);
  const [detailErrors, setDetailErrors] = useState<DetailErrors>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activeMembers.map((member) => member.id)));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [exemptions, setExemptions] = useState<Record<string, Exemption>>({});
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "create" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Details>(key: K, value: Details[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
    setDetailErrors((current) => ({ ...current, [key === "startMonth" || key === "endMonth" ? "months" : key]: undefined }));
    setSubmitError(null);
  };

  const dirty =
    !saved &&
    (JSON.stringify(details) !== JSON.stringify(initial) ||
      Object.values(overrides).some((value) => value.trim()) ||
      Object.values(exemptions).some((value) => value.on) ||
      selected.size !== activeMembers.length);

  // Leaving with unsaved input: the browser asks before closing or reloading the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const voluntary = details.type === "voluntary";
  const parsedDefault = !voluntary && details.amount.trim() ? parseMoney(details.amount) : null;
  const defaultSen: Sen | null = parsedDefault && parsedDefault.error === null ? parsedDefault.sen : null;
  const months =
    details.type === "monthly" && isMonth(details.startMonth) && isMonth(details.endMonth) ? monthsBetween(details.startMonth, details.endMonth) : [];

  /** Amount one member will owe, or null when their input is not valid yet. */
  const amountFor = (memberId: string): Sen | null => {
    const raw = overrides[memberId]?.trim();
    if (!raw) return defaultSen;
    const parsed = parseMoney(raw);
    return parsed.error === null ? parsed.sen : null;
  };

  const chosen = activeMembers.filter((member) => selected.has(member.id));
  const exemptChosen = voluntary ? [] : chosen.filter((member) => exemptions[member.id]?.on);
  const payingChosen = voluntary ? chosen : chosen.filter((member) => !exemptions[member.id]?.on);
  const perPeriodTotal = payingChosen.reduce<Sen | null>((total, member) => {
    const amount = amountFor(member.id);
    return total === null || amount === null ? null : total + amount;
  }, 0);
  const expectedTotal =
    voluntary || perPeriodTotal === null ? null : details.type === "monthly" ? perPeriodTotal * months.length : perPeriodTotal;

  // Validation ---------------------------------------------------------------------------

  const validateDetails = (): boolean => {
    const errors: DetailErrors = {};
    const name = details.name.replace(/\s+/g, " ").trim();
    if (!name) errors.name = errorMessages.NAME_REQUIRED;
    else if (name.length > 120) errors.name = errorMessages.NAME_TOO_LONG;
    else if (data.collections.some((row) => row.status !== "archived" && normaliseName(row.name) === normaliseName(name)))
      errors.name = errorMessages.COLLECTION_DUPLICATE;
    if (!voluntary) {
      const parsed = parseMoney(details.amount);
      if (parsed.error !== null) errors.amount = parsed.error;
      else if (parsed.sen === 0) errors.amount = errorMessages.AMOUNT_ZERO;
    }
    if (details.type === "monthly") {
      if (!isMonth(details.startMonth) || !isMonth(details.endMonth) || !months.length) errors.months = errorMessages.MONTH_RANGE_INVALID;
      else if (months.length > 36) errors.months = errorMessages.MONTH_RANGE_TOO_LONG;
      const day = details.dueDay.trim();
      if (day && (!/^\d{1,2}$/.test(day) || Number(day) < 1 || Number(day) > 31)) errors.dueDay = errorMessages.DUE_DAY_INVALID;
    }
    setDetailErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateMembers = (requireOne: boolean): boolean => {
    const errors: Record<string, string> = {};
    if (!voluntary) {
      for (const member of chosen) {
        const exemption = exemptions[member.id];
        if (exemption?.on) {
          if (!exemption.reason.trim()) errors[member.id] = "Nyatakan sebab pengecualian. Ia disimpan dalam log audit.";
          continue;
        }
        const raw = overrides[member.id]?.trim();
        if (!raw) continue;
        const parsed = parseMoney(raw);
        if (parsed.error !== null) errors[member.id] = parsed.error;
        else if (parsed.sen === 0) errors[member.id] = errorMessages.AMOUNT_ZERO;
      }
    }
    setMemberErrors(errors);
    if (requireOne && chosen.length === 0) {
      setStepError("Pilih sekurang-kurangnya seorang ahli.");
      return false;
    }
    const count = Object.keys(errors).length;
    setStepError(count ? `Betulkan ${count} ralat dalam senarai ahli.` : null);
    return count === 0;
  };

  // Navigation and saving ----------------------------------------------------------------

  const goTo = (next: Step) => {
    setSubmitError(null);
    if (next > step) {
      if (!validateDetails()) return setStep(0);
      if (next === 2 && !validateMembers(true)) return setStep(1);
    }
    setStepError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const participants = (): NewParticipant[] =>
    chosen.map((member) => {
      if (voluntary) return { memberId: member.id, amountOverride: null, exempt: false, note: null };
      const exemption = exemptions[member.id];
      const amount = amountFor(member.id);
      return {
        memberId: member.id,
        amountOverride: amount !== null && amount !== defaultSen ? amount : null,
        exempt: Boolean(exemption?.on),
        note: exemption?.on ? exemption.reason.trim() : null,
      };
    });

  const save = async (activate: boolean) => {
    setSubmitError(null);
    if (!validateDetails()) return setStep(0);
    if (!validateMembers(activate)) return setStep(1);
    setBusy(activate ? "create" : "draft");
    try {
      const day = details.dueDay.trim();
      const id = await run((backend) =>
        backend.createCollection({
          name: details.name,
          type: details.type,
          defaultAmount: voluntary ? null : defaultSen,
          description: details.description.trim() || null,
          notes: details.notes.trim() || null,
          dueDate: details.type === "one_off" && details.dueDate ? details.dueDate : null,
          startMonth: details.type === "monthly" ? details.startMonth : null,
          endMonth: details.type === "monthly" ? details.endMonth : null,
          dueDay: details.type === "monthly" && day ? Number(day) : null,
          participants: participants(),
          icon: iconOf(details),
          activate,
        }),
      );
      setSaved(true);
      toast.success(activate ? `Kutipan "${details.name.trim()}" dicipta untuk ${chosen.length} ahli.` : `Draf "${details.name.trim()}" disimpan.`);
      router.push(`/kutipan/${id}/`);
    } catch (cause) {
      setSubmitError(messageFor(cause));
      setBusy(null);
    }
  };

  const leave = () => {
    if (dirty && !window.confirm("Buang kutipan yang belum disimpan?")) return;
    setSaved(true);
    router.push("/kutipan/");
  };

  const last = step === 2;

  return (
    <PageShell className="pb-28 md:pb-7">
      <PageHeader
        title="Tambah Kutipan"
        description="Cipta kutipan baharu dan pilih ahli yang terlibat. Ahli baharu tidak dimasukkan secara automatik ke mana-mana kutipan."
        back={{ href: "/kutipan/", label: "Kutipan KGK" }}
      />

      <Stepper step={step} onGo={(next) => next < step && goTo(next)} />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          {step === 0 && <DetailsStep details={details} set={set} errors={detailErrors} months={months.length} />}
          {step === 1 && (
            <MembersStep
              members={activeMembers}
              voluntary={voluntary}
              monthly={details.type === "monthly"}
              defaultSen={defaultSen}
              selected={selected}
              setSelected={(next) => {
                setSelected(next);
                setStepError(null);
              }}
              overrides={overrides}
              setOverrides={setOverrides}
              exemptions={exemptions}
              setExemptions={setExemptions}
              errors={memberErrors}
              payingCount={payingChosen.length}
              exemptCount={exemptChosen.length}
            />
          )}
          {step === 2 && (
            <ReviewStep
              details={details}
              defaultSen={defaultSen}
              months={months}
              paying={payingChosen}
              exempt={exemptChosen}
              amountFor={amountFor}
              exemptions={exemptions}
              perPeriodTotal={perPeriodTotal}
              expectedTotal={expectedTotal}
              onEdit={(target) => goTo(target)}
            />
          )}

          {(stepError || submitError) && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-st-unpaid-bg/60 px-3 py-2 text-sm font-medium text-st-unpaid">
              {submitError ?? stepError}
            </p>
          )}

          {/* Desktop and tablet actions. On phones the primary pair lives in the sticky bar. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={leave} disabled={busy !== null} className="hidden md:inline-flex">
                Batal
              </Button>
              <Button variant="outline" size="lg" onClick={() => void save(false)} disabled={busy !== null} className="w-full sm:w-auto">
                {busy === "draft" ? <Spinner className="size-4" /> : <Save />}
                Simpan sebagai draf
              </Button>
            </div>
            <div className="hidden gap-2 md:flex">
              {step > 0 && (
                <Button variant="outline" size="lg" onClick={() => goTo((step - 1) as Step)} disabled={busy !== null}>
                  <ArrowLeft /> Kembali
                </Button>
              )}
              {last ? (
                <Button size="lg" onClick={() => void save(true)} disabled={busy !== null}>
                  {busy === "create" ? <Spinner className="size-4" /> : <Check />}
                  Cipta kutipan
                </Button>
              ) : (
                <Button size="lg" onClick={() => goTo((step + 1) as Step)} disabled={busy !== null}>
                  Seterusnya <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        </div>

        <LiveSummary
          details={details}
          defaultSen={defaultSen}
          months={months.length}
          chosen={chosen.length}
          paying={payingChosen.length}
          exempt={exemptChosen.length}
          expectedTotal={expectedTotal}
        />
      </div>

      {/* Phone action bar, above the bottom navigation. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-xl md:hidden">
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="outline" size="lg" className="flex-1" onClick={() => goTo((step - 1) as Step)} disabled={busy !== null}>
              <ArrowLeft /> Kembali
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="flex-1" onClick={leave} disabled={busy !== null}>
              Batal
            </Button>
          )}
          {last ? (
            <Button size="lg" className="flex-1" onClick={() => void save(true)} disabled={busy !== null}>
              {busy === "create" ? <Spinner className="size-4" /> : <Check />}
              Cipta
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={() => goTo((step + 1) as Step)} disabled={busy !== null}>
              Seterusnya <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// Stepper ------------------------------------------------------------------------------------

function Stepper({ step, onGo }: { step: Step; onGo: (step: Step) => void }) {
  return (
    <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-2 md:gap-3 md:p-3" aria-label="Langkah">
      {steps.map((item, index) => {
        const state = index < step ? "done" : index === step ? "current" : "todo";
        return (
          <li key={item.title} className="min-w-0">
            <Button
              variant="ghost"
              onClick={() => onGo(index as Step)}
              disabled={state !== "done"}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "h-auto min-h-12 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center font-normal whitespace-normal hover:bg-transparent disabled:opacity-100 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3 sm:text-left",
                state === "current" && "bg-primary-tint",
                state === "done" && "hover:bg-primary-tint",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                  state === "current" && "bg-primary-fill text-primary-foreground",
                  state === "done" && "bg-primary-light text-primary-strong",
                  state === "todo" && "border border-border text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[11.5px] leading-tight font-semibold sm:text-sm", state === "todo" && "text-muted-foreground")}>
                  {item.title}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">{item.hint}</span>
              </span>
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

// Step 1 -------------------------------------------------------------------------------------

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-st-unpaid">
      {message}
    </p>
  );
}

function DetailsStep({
  details,
  set,
  errors,
  months,
}: {
  details: Details;
  set: <K extends keyof Details>(key: K, value: Details[K]) => void;
  errors: DetailErrors;
  months: number;
}) {
  const icon = iconOf(details);
  return (
    <SectionCard title="Butiran Kutipan" icon={FileText} description="Maklumat asas kutipan. Anda boleh ubah nama dan tarikh akhir kemudian.">
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="wz-name">Nama kutipan</Label>
          <div className="flex gap-2">
            <EmojiPicker value={icon} onChange={(next) => set("icon", next)} label={details.name.trim() || "Kutipan baharu"}>
              <button
                type="button"
                aria-label="Pilih ikon kutipan"
                aria-describedby="wz-icon-hint"
                title="Pilih ikon"
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-input bg-card text-primary-strong outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-expanded:border-ring"
              >
                <CollectionIcon icon={icon} type={details.type} size="lg" />
              </button>
            </EmojiPicker>
            <Input
              id="wz-name"
              value={details.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="cth. Jamuan Akhir Tahun"
              className="h-11 min-w-0 flex-1 rounded-xl"
              maxLength={140}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "wz-name-error wz-icon-hint" : "wz-icon-hint"}
            />
          </div>
          <FieldError id="wz-name-error" message={errors.name} />
          <p id="wz-icon-hint" className="text-xs text-muted-foreground">
            {details.icon !== undefined
              ? "Ikon membantu guru mengenal kutipan sekilas pandang."
              : icon
                ? "Ikon dicadangkan daripada nama. Klik ikon untuk menukar."
                : "Klik ikon untuk memilih emoji yang membantu guru mengenal kutipan ini."}
          </p>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Jenis kutipan</legend>
          <ChoiceCards label="Jenis kutipan" value={details.type} onChange={(value) => set("type", value)} className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(collectionTypeLabels) as CollectionType[]).map((value) => {
              const Icon = collectionTypeIcons[value];
              const on = details.type === value;
              return (
                <ChoiceCard key={value} value={value} checked={on}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", on ? "bg-primary-fill text-primary-foreground" : "bg-primary-light text-primary-strong")}>
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", !on && "text-foreground")}>{collectionTypeLabels[value]}</span>
                    <span className="block text-xs text-muted-foreground">{typeHints[value]}</span>
                  </span>
                </ChoiceCard>
              );
            })}
          </ChoiceCards>
        </fieldset>

        {details.type !== "voluntary" ? (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="wz-amount">{details.type === "monthly" ? "Amaun sebulan (asal)" : "Amaun seorang (asal)"}</Label>
            <MoneyInput
              id="wz-amount"
              value={details.amount}
              onChange={(event) => set("amount", event.target.value)}
              placeholder="25.00"
              invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "wz-amount-error" : "wz-amount-hint"}
            />
            {errors.amount ? (
              <FieldError id="wz-amount-error" message={errors.amount} />
            ) : (
              <p id="wz-amount-hint" className="text-xs text-muted-foreground">
                Amaun berbeza untuk ahli tertentu boleh ditetapkan dalam langkah seterusnya.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-primary-tint px-3 py-2.5 text-sm text-muted-foreground">
            Sumbangan sukarela tiada amaun tetap dan tidak mencipta hutang. Setiap sumbangan direkod apabila diterima.
          </p>
        )}

        {details.type === "one_off" && (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="wz-due">Tarikh akhir (pilihan)</Label>
            <DatePicker id="wz-due" value={details.dueDate} onChange={(day) => set("dueDate", day)} clearable emptyLabel="Tiada tarikh akhir" clearLabel="Tiada tarikh akhir" />
            <p className="text-xs text-muted-foreground">Tanpa tarikh akhir, caj tidak akan menjadi Lewat.</p>
          </div>
        )}

        {details.type === "monthly" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:max-w-md">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="wz-start">Bulan mula</Label>
                <MonthPicker
                  id="wz-start"
                  value={details.startMonth}
                  onChange={(month) => set("startMonth", month)}
                  invalid={Boolean(errors.months)}
                  aria-describedby={errors.months ? "wz-months-error" : undefined}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="wz-end">Bulan akhir</Label>
                <MonthPicker
                  id="wz-end"
                  value={details.endMonth}
                  min={details.startMonth}
                  onChange={(month) => set("endMonth", month)}
                  invalid={Boolean(errors.months)}
                  aria-describedby={errors.months ? "wz-months-error" : undefined}
                />
              </div>
            </div>
            {errors.months ? (
              <FieldError id="wz-months-error" message={errors.months} />
            ) : (
              months > 0 && <p className="text-xs text-muted-foreground">{months} bulan. Setiap bulan menjadi caj berasingan untuk setiap ahli.</p>
            )}
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="wz-dueday">Hari akhir bayaran setiap bulan</Label>
              <Input
                id="wz-dueday"
                type="text"
                inputMode="numeric"
                value={details.dueDay}
                onChange={(event) => set("dueDay", event.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                placeholder="10"
                aria-invalid={Boolean(errors.dueDay)}
                aria-describedby="wz-dueday-hint"
              />
              <FieldError id="wz-dueday-error" message={errors.dueDay} />
              <p id="wz-dueday-hint" className="text-xs text-muted-foreground">
                1 hingga 31. Hari yang melebihi hujung bulan menjadi hari terakhir bulan itu (cth. 31 → 28 Februari). Kosongkan jika tiada tarikh akhir.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="wz-desc">Penerangan (pilihan)</Label>
            <Textarea id="wz-desc" value={details.description} onChange={(event) => set("description", event.target.value)} rows={3} placeholder="Dilihat oleh bendahari dalam butiran kutipan." />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wz-notes">Nota dalaman (pilihan)</Label>
            <Textarea id="wz-notes" value={details.notes} onChange={(event) => set("notes", event.target.value)} rows={3} placeholder="cth. diluluskan dalam mesyuarat AJK 3 Mac." />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// Step 2 -------------------------------------------------------------------------------------

function MembersStep({
  members,
  voluntary,
  monthly,
  defaultSen,
  selected,
  setSelected,
  overrides,
  setOverrides,
  exemptions,
  setExemptions,
  errors,
  payingCount,
  exemptCount,
}: {
  members: Member[];
  voluntary: boolean;
  monthly: boolean;
  defaultSen: Sen | null;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  overrides: Record<string, string>;
  setOverrides: (update: (current: Record<string, string>) => Record<string, string>) => void;
  exemptions: Record<string, Exemption>;
  setExemptions: (update: (current: Record<string, Exemption>) => Record<string, Exemption>) => void;
  errors: Record<string, string>;
  payingCount: number;
  exemptCount: number;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [bulk, setBulk] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  const allSelected = selected.size === members.length && members.length > 0;
  const hasUncategorised = members.some((member) => member.category === null);

  const visible = members.filter((member) => {
    if (category === "none" ? member.category !== null : category !== "all" && member.category !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || member.name.toLowerCase().includes(q);
  });
  const visibleSelected = visible.filter((member) => selected.has(member.id));
  const allVisibleSelected = visible.length > 0 && visibleSelected.length === visible.length;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const toggleVisible = (on: boolean) => {
    const next = new Set(selected);
    for (const member of visible) {
      if (on) next.add(member.id);
      else next.delete(member.id);
    }
    setSelected(next);
  };

  const applyBulk = () => {
    const parsed = parseMoney(bulk);
    if (parsed.error !== null) return setBulkError(parsed.error);
    if (parsed.sen === 0) return setBulkError(errorMessages.AMOUNT_ZERO);
    setBulkError(null);
    const value = parsed.sen === defaultSen ? "" : senToInput(parsed.sen);
    setOverrides((current) => {
      const next = { ...current };
      for (const member of visibleSelected) next[member.id] = value;
      return next;
    });
    toast.success(`Amaun ${formatMoney(parsed.sen)} ditetapkan untuk ${visibleSelected.length} ahli.`);
    setBulk("");
  };

  const categories: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "all", label: "Semua", count: members.length },
    ...(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({
      value,
      label: categoryLabels[value],
      count: members.filter((member) => member.category === value).length,
    })),
    ...(hasUncategorised ? [{ value: "none" as const, label: "Tiada kategori", count: members.filter((m) => m.category === null).length }] : []),
  ];

  return (
    <SectionCard
      title="Pilih Ahli"
      icon={UsersRound}
      description={voluntary ? "Ahli yang dijemput menyumbang. Mereka tidak berhutang apa-apa." : "Hanya ahli yang dipilih akan mendapat caj."}
    >
      <div className="grid gap-4">
        <ChoiceCards
          label="Skop ahli"
          value={allSelected ? "all" : "some"}
          onChange={(value) => {
            if (value === "all") setSelected(new Set(members.map((m) => m.id)));
            // Only clears when switching from "all"; a custom selection is never wiped.
            else if (allSelected) setSelected(new Set());
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          {[
            { value: "all", on: allSelected, label: `Semua ahli aktif (${members.length})`, hint: "Pilihan biasa untuk yuran dan jamuan." },
            { value: "some", on: !allSelected, label: "Ahli terpilih sahaja", hint: "Mulakan dengan senarai kosong dan tanda sendiri." },
          ].map((option) => (
            <ChoiceCard key={option.value} value={option.value} checked={option.on} indicator>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", !option.on && "text-foreground")}>{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </ChoiceCard>
          ))}
        </ChoiceCards>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary-tint px-3 py-2.5 text-sm" aria-live="polite">
          <span className="font-semibold">{selected.size} ahli dipilih</span>
          {!voluntary && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>
                <b className="tabular-nums">{payingCount}</b> perlu bayar
              </span>
              {exemptCount > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>{exemptCount} dikecualikan</span>
                </>
              )}
            </>
          )}
        </div>

        <Toolbar
          search={<SearchInput id="wz-member-search" value={query} onChange={setQuery} placeholder="Cari ahli…" />}
          tabs={<FilterPills label="Tapis kategori" value={category} onChange={setCategory} options={categories} />}
        />

        {!voluntary && (
          <div className="grid gap-1.5 rounded-xl border border-dashed border-border p-3">
            <Label htmlFor="wz-bulk" className="text-xs text-muted-foreground">
              Set amaun untuk dipilih ({visibleSelected.length} ahli dalam paparan ini)
            </Label>
            <div className="flex flex-col gap-2 min-[400px]:flex-row">
              <MoneyInput
                id="wz-bulk"
                value={bulk}
                onChange={(event) => {
                  setBulk(event.target.value);
                  setBulkError(null);
                }}
                placeholder={defaultSen !== null ? senToInput(defaultSen) : "0.00"}
                invalid={Boolean(bulkError)}
                className="min-w-0 flex-1 min-[400px]:max-w-48"
              />
              <Button variant="brand" size="lg" onClick={applyBulk} disabled={!visibleSelected.length || !bulk.trim()}>
                Set amaun
              </Button>
            </div>
            {bulkError && <p className="text-xs font-medium text-st-unpaid">{bulkError}</p>}
          </div>
        )}

        {members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Tiada ahli aktif. Tambah ahli di halaman Ahli dahulu, atau simpan kutipan ini sebagai draf.
          </p>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border">
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border bg-primary-tint px-3 text-xs font-semibold text-muted-foreground">
              <Checkbox checked={allVisibleSelected ? true : visibleSelected.length ? "indeterminate" : false} onCheckedChange={(value) => toggleVisible(value === true)} />
              {allVisibleSelected ? "Nyahpilih semua dalam paparan" : "Pilih semua dalam paparan"} ({visible.length})
            </label>
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Tiada ahli sepadan dengan carian atau kategori ini.</p>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    voluntary={voluntary}
                    monthly={monthly}
                    defaultSen={defaultSen}
                    on={selected.has(member.id)}
                    onToggle={(on) => toggle(member.id, on)}
                    override={overrides[member.id] ?? ""}
                    setOverride={(value) => setOverrides((current) => ({ ...current, [member.id]: value }))}
                    exemption={exemptions[member.id] ?? { on: false, reason: "" }}
                    setExemption={(value) => setExemptions((current) => ({ ...current, [member.id]: value }))}
                    error={errors[member.id]}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function MemberRow({
  member,
  voluntary,
  monthly,
  defaultSen,
  on,
  onToggle,
  override,
  setOverride,
  exemption,
  setExemption,
  error,
}: {
  member: Member;
  voluntary: boolean;
  monthly: boolean;
  defaultSen: Sen | null;
  on: boolean;
  onToggle: (on: boolean) => void;
  override: string;
  setOverride: (value: string) => void;
  exemption: Exemption;
  setExemption: (value: Exemption) => void;
  error?: string;
}) {
  const checkboxId = `wz-m-${member.id}`;
  return (
    <li className={cn("grid gap-2.5 px-3 py-3", on ? "bg-card" : "bg-muted/40")}>
      <div className="flex min-w-0 items-center gap-3">
        <Checkbox id={checkboxId} checked={on} onCheckedChange={(value) => onToggle(value === true)} className="size-5" />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium break-words">{member.name}</span>
          <span className="block text-xs text-muted-foreground">{member.category ? categoryLabels[member.category] : "Tiada kategori"}</span>
        </label>
        {on && !voluntary && exemption.on && <StatusChip label="Dikecualikan" tone="exempt" compact />}
        {on && !voluntary && !exemption.on && override.trim() && <StatusChip label="Amaun khas" tone="brand" compact />}
      </div>

      {on && !voluntary && (
        <div className="grid gap-2 pl-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {!exemption.on && (
              <div className="flex min-w-0 items-center gap-1.5">
                <MoneyInput
                  aria-label={`Amaun ${monthly ? "sebulan " : ""}untuk ${member.name}`}
                  value={override}
                  onChange={(event) => setOverride(event.target.value)}
                  placeholder={defaultSen !== null ? senToInput(defaultSen) : "Amaun asal"}
                  invalid={Boolean(error)}
                  className="w-36 min-w-0"
                />
                {override.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setOverride("")} className="h-11">
                    <RotateCcw /> Set semula ke asal
                  </Button>
                )}
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <Switch checked={exemption.on} onCheckedChange={(value) => setExemption({ ...exemption, on: value })} aria-label={`Kecualikan ${member.name}`} />
              Kecualikan
            </label>
          </div>
          {exemption.on && (
            <Input
              value={exemption.reason}
              onChange={(event) => setExemption({ ...exemption, reason: event.target.value })}
              placeholder="Sebab pengecualian, cth. cuti tanpa gaji"
              aria-label={`Sebab pengecualian untuk ${member.name}`}
              aria-invalid={Boolean(error)}
            />
          )}
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
        </div>
      )}
    </li>
  );
}

// Step 3 -------------------------------------------------------------------------------------

function ReviewStep({
  details,
  defaultSen,
  months,
  paying,
  exempt,
  amountFor,
  exemptions,
  perPeriodTotal,
  expectedTotal,
  onEdit,
}: {
  details: Details;
  defaultSen: Sen | null;
  months: string[];
  paying: Member[];
  exempt: Member[];
  amountFor: (memberId: string) => Sen | null;
  exemptions: Record<string, Exemption>;
  perPeriodTotal: Sen | null;
  expectedTotal: Sen | null;
  onEdit: (step: Step) => void;
}) {
  const voluntary = details.type === "voluntary";
  const due =
    details.type === "one_off"
      ? details.dueDate
        ? formatDay(details.dueDate)
        : "Tiada tarikh akhir"
      : details.type === "monthly"
        ? details.dueDay.trim()
          ? `Sebelum ${Number(details.dueDay)}hb setiap bulan (hari terakhir bulan jika lebih)`
          : "Tiada tarikh akhir"
        : "Tiada tarikh akhir";

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Semak butiran"
        icon={FileText}
        action={
          <Button variant="outline" size="sm" onClick={() => onEdit(0)}>
            Ubah
          </Button>
        }
      >
        <DetailList
          items={[
            {
              label: "Nama",
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <CollectionIcon icon={iconOf(details)} type={details.type} size="sm" />
                  {details.name.trim()}
                </span>
              ),
            },
            { label: "Jenis", value: collectionTypeLabels[details.type] },
            { label: "Amaun asal", value: voluntary ? "Ikut kemampuan" : defaultSen !== null ? `${formatMoney(defaultSen)}${details.type === "monthly" ? " sebulan" : " seorang"}` : "—" },
            ...(details.type === "monthly"
              ? [{ label: "Tempoh", value: months.length ? `${formatMonth(months[0])} – ${formatMonth(months[months.length - 1])} (${months.length} bulan)` : "—" }]
              : []),
            { label: "Tarikh akhir", value: due },
            { label: "Penerangan", value: details.description.trim() },
            { label: "Nota", value: details.notes.trim() },
          ]}
        />
      </SectionCard>

      <SectionCard
        title={voluntary ? `Ahli dijemput (${paying.length})` : `Ahli perlu bayar (${paying.length})`}
        icon={UsersRound}
        action={
          <Button variant="outline" size="sm" onClick={() => onEdit(1)}>
            Ubah
          </Button>
        }
      >
        {paying.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tiada ahli dipilih. Kutipan hanya boleh disimpan sebagai draf.</p>
        ) : (
          <ul className="grid max-h-80 gap-1 overflow-y-auto overscroll-contain pr-1">
            {paying.map((member) => {
              const amount = amountFor(member.id);
              return (
                <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-primary-tint/50">
                  <span className="min-w-0 break-words">{member.name}</span>
                  {!voluntary && (
                    <span className={cn("shrink-0 tabular-nums", amount !== defaultSen && "font-semibold text-primary-strong")}>
                      {amount !== null ? formatMoney(amount) : "—"}
                      {details.type === "monthly" && <span className="text-xs font-normal text-muted-foreground"> /bln</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {exempt.length > 0 && (
        <SectionCard title={`Dikecualikan (${exempt.length})`} description="Termasuk dalam kutipan tetapi tidak perlu membayar.">
          <ul className="grid gap-1.5">
            {exempt.map((member) => (
              <li key={member.id} className="flex flex-col gap-0.5 rounded-lg bg-st-exempt-bg/60 px-2.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="min-w-0 font-medium break-words">{member.name}</span>
                <span className="min-w-0 text-xs break-words text-muted-foreground">{exemptions[member.id]?.reason}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="rounded-2xl border border-primary/30 bg-primary-tint p-4 md:p-5">
        {voluntary ? (
          <p className="text-sm">
            <b>Tiada jumlah dijangka.</b> Sumbangan sukarela tidak mencipta hutang; jumlah terkumpul dikira daripada sumbangan yang disahkan.
          </p>
        ) : (
          <>
            <p className="text-[13px] font-medium text-muted-foreground">Jumlah dijangka</p>
            <p className="mt-0.5 text-[26px] leading-tight font-bold tracking-[-.02em] tabular-nums">{expectedTotal !== null ? formatMoney(expectedTotal) : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {paying.length} ahli
              {details.type === "monthly" && perPeriodTotal !== null && (
                <>
                  {" "}
                  · {formatMoney(perPeriodTotal)} sebulan × {months.length} bulan
                </>
              )}
              {exempt.length > 0 && <> · {exempt.length} dikecualikan tidak dikira</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Live summary (large screens) ---------------------------------------------------------------

function LiveSummary({
  details,
  defaultSen,
  months,
  chosen,
  paying,
  exempt,
  expectedTotal,
}: {
  details: Details;
  defaultSen: Sen | null;
  months: number;
  chosen: number;
  paying: number;
  exempt: number;
  expectedTotal: Sen | null;
}) {
  const voluntary = details.type === "voluntary";
  return (
    <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Ringkasan">
      <SectionCard title="Ringkasan">
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nama</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1.5 font-medium">
              {details.name.trim() && <CollectionIcon icon={iconOf(details)} type={details.type} size="xs" />}
              <span className="truncate">{details.name.trim() || "—"}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Jenis</dt>
            <dd className="text-right">{collectionTypeLabels[details.type]}</dd>
          </div>
          {!voluntary && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Amaun asal</dt>
              <dd className="text-right tabular-nums">{defaultSen !== null ? <Money sen={defaultSen} /> : "—"}</dd>
            </div>
          )}
          {details.type === "monthly" && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tempoh</dt>
              <dd className="text-right tabular-nums">{months ? `${months} bulan` : "—"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Ahli dipilih</dt>
            <dd className="text-right tabular-nums">
              {chosen}
              {exempt > 0 && <span className="text-muted-foreground"> ({exempt} dikecualikan)</span>}
            </dd>
          </div>
          <div className="mt-1 border-t border-border pt-2.5">
            <dt className="text-xs text-muted-foreground">{voluntary ? "Jumlah dijangka" : `Jumlah dijangka (${paying} ahli)`}</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums">{voluntary ? "Tiada" : expectedTotal !== null ? formatMoney(expectedTotal) : "—"}</dd>
          </div>
        </dl>
      </SectionCard>
    </aside>
  );
}
