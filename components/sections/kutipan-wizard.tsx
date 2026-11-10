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
import { useT } from "@/lib/i18n/react";
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
  const t = useT();
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
          if (!exemption.reason.trim()) errors[member.id] = t("wizard.messages.exemptionReason");
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
      setStepError(t("wizard.messages.pickOne"));
      return false;
    }
    const count = Object.keys(errors).length;
    setStepError(count ? t(count === 1 ? "wizard.messages.fixErrorsOne" : "wizard.messages.fixErrors", { count }) : null);
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
      toast.success(
        activate
          ? t(chosen.length === 1 ? "wizard.messages.createdOne" : "wizard.messages.created", { name: details.name.trim(), count: chosen.length })
          : t("wizard.messages.draftSaved", { name: details.name.trim() }),
      );
      router.push(`/kutipan/${id}/`);
    } catch (cause) {
      setSubmitError(messageFor(cause));
      setBusy(null);
    }
  };

  const leave = () => {
    if (dirty && !window.confirm(t("wizard.messages.confirmLeave"))) return;
    setSaved(true);
    router.push("/kutipan/");
  };

  const last = step === 2;

  return (
    <PageShell className="pb-28 md:pb-7">
      <PageHeader
        title={t("wizard.header.title")}
        description={t("wizard.header.description")}
        back={{ href: "/kutipan/", label: t("nav.collections") }}
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
                {t("common.cancel")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => void save(false)} disabled={busy !== null} className="w-full sm:w-auto">
                {busy === "draft" ? <Spinner className="size-4" /> : <Save />}
                {t("wizard.actions.saveDraft")}
              </Button>
            </div>
            <div className="hidden gap-2 md:flex">
              {step > 0 && (
                <Button variant="outline" size="lg" onClick={() => goTo((step - 1) as Step)} disabled={busy !== null}>
                  <ArrowLeft /> {t("common.back")}
                </Button>
              )}
              {last ? (
                <Button size="lg" onClick={() => void save(true)} disabled={busy !== null}>
                  {busy === "create" ? <Spinner className="size-4" /> : <Check />}
                  {t("wizard.actions.create")}
                </Button>
              ) : (
                <Button size="lg" onClick={() => goTo((step + 1) as Step)} disabled={busy !== null}>
                  {t("wizard.actions.next")} <ArrowRight />
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
              <ArrowLeft /> {t("common.back")}
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="flex-1" onClick={leave} disabled={busy !== null}>
              {t("common.cancel")}
            </Button>
          )}
          {last ? (
            <Button size="lg" className="flex-1" onClick={() => void save(true)} disabled={busy !== null}>
              {busy === "create" ? <Spinner className="size-4" /> : <Check />}
              {t("wizard.actions.createShort")}
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={() => goTo((step + 1) as Step)} disabled={busy !== null}>
              {t("wizard.actions.next")} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// Stepper ------------------------------------------------------------------------------------

function Stepper({ step, onGo }: { step: Step; onGo: (step: Step) => void }) {
  const t = useT();
  const steps = [
    { title: t("wizard.stepper.detailsTitle"), hint: t("wizard.stepper.detailsHint") },
    { title: t("wizard.stepper.membersTitle"), hint: t("wizard.stepper.membersHint") },
    { title: t("wizard.stepper.reviewTitle"), hint: t("wizard.stepper.reviewHint") },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-2 md:gap-3 md:p-3" aria-label={t("wizard.stepper.label")}>
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
  const t = useT();
  const icon = iconOf(details);
  return (
    <SectionCard title={t("wizard.details.title")} icon={FileText} description={t("wizard.details.description")}>
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="wz-name">{t("wizard.details.nameLabel")}</Label>
          <div className="flex gap-2">
            <EmojiPicker value={icon} onChange={(next) => set("icon", next)} label={details.name.trim() || t("wizard.details.newCollection")}>
              <button
                type="button"
                aria-label={t("wizard.details.pickIconAria")}
                aria-describedby="wz-icon-hint"
                title={t("wizard.details.pickIconTitle")}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-input bg-card text-primary-strong outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-expanded:border-ring"
              >
                <CollectionIcon icon={icon} type={details.type} size="lg" />
              </button>
            </EmojiPicker>
            <Input
              id="wz-name"
              value={details.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder={t("wizard.details.namePlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-xl"
              maxLength={140}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "wz-name-error wz-icon-hint" : "wz-icon-hint"}
            />
          </div>
          <FieldError id="wz-name-error" message={errors.name} />
          <p id="wz-icon-hint" className="text-xs text-muted-foreground">
            {details.icon !== undefined
              ? t("wizard.details.iconHintPicked")
              : icon
                ? t("wizard.details.iconHintSuggested")
                : t("wizard.details.iconHintNone")}
          </p>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t("wizard.details.typeLabel")}</legend>
          <ChoiceCards label={t("wizard.details.typeLabel")} value={details.type} onChange={(value) => set("type", value)} className="grid gap-2 sm:grid-cols-3">
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
                    <span className="block text-xs text-muted-foreground">{t(`wizard.typeHints.${value}`)}</span>
                  </span>
                </ChoiceCard>
              );
            })}
          </ChoiceCards>
        </fieldset>

        {details.type !== "voluntary" ? (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="wz-amount">{details.type === "monthly" ? t("wizard.details.amountMonthly") : t("wizard.details.amountOneOff")}</Label>
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
                {t("wizard.details.amountHint")}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-primary-tint px-3 py-2.5 text-sm text-muted-foreground">
            {t("wizard.details.voluntaryNote")}
          </p>
        )}

        {details.type === "one_off" && (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="wz-due">{t("wizard.details.dueDateLabel")}</Label>
            <DatePicker id="wz-due" value={details.dueDate} onChange={(day) => set("dueDate", day)} clearable emptyLabel={t("wizard.details.noDeadline")} clearLabel={t("wizard.details.noDeadline")} />
            <p className="text-xs text-muted-foreground">{t("wizard.details.dueDateHint")}</p>
          </div>
        )}

        {details.type === "monthly" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:max-w-md">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="wz-start">{t("wizard.details.startMonth")}</Label>
                <MonthPicker
                  id="wz-start"
                  value={details.startMonth}
                  onChange={(month) => set("startMonth", month)}
                  invalid={Boolean(errors.months)}
                  aria-describedby={errors.months ? "wz-months-error" : undefined}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="wz-end">{t("wizard.details.endMonth")}</Label>
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
              months > 0 && <p className="text-xs text-muted-foreground">{t(months === 1 ? "wizard.details.monthsHintOne" : "wizard.details.monthsHint", { count: months })}</p>
            )}
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="wz-dueday">{t("wizard.details.dueDayLabel")}</Label>
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
                {t("wizard.details.dueDayHint")}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="wz-desc">{t("wizard.details.descriptionLabel")}</Label>
            <Textarea id="wz-desc" value={details.description} onChange={(event) => set("description", event.target.value)} rows={3} placeholder={t("wizard.details.descriptionPlaceholder")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wz-notes">{t("wizard.details.notesLabel")}</Label>
            <Textarea id="wz-notes" value={details.notes} onChange={(event) => set("notes", event.target.value)} rows={3} placeholder={t("wizard.details.notesPlaceholder")} />
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
  const t = useT();
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
    toast.success(t(visibleSelected.length === 1 ? "wizard.messages.bulkAppliedOne" : "wizard.messages.bulkApplied", { amount: formatMoney(parsed.sen), count: visibleSelected.length }));
    setBulk("");
  };

  const categories: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "all", label: t("wizard.members.all"), count: members.length },
    ...(Object.keys(categoryLabels) as MemberCategory[]).map((value) => ({
      value,
      label: categoryLabels[value],
      count: members.filter((member) => member.category === value).length,
    })),
    ...(hasUncategorised ? [{ value: "none" as const, label: t("wizard.members.noCategory"), count: members.filter((m) => m.category === null).length }] : []),
  ];

  return (
    <SectionCard
      title={t("wizard.members.title")}
      icon={UsersRound}
      description={voluntary ? t("wizard.members.descriptionVoluntary") : t("wizard.members.description")}
    >
      <div className="grid gap-4">
        <ChoiceCards
          label={t("wizard.members.scopeLabel")}
          value={allSelected ? "all" : "some"}
          onChange={(value) => {
            if (value === "all") setSelected(new Set(members.map((m) => m.id)));
            // Only clears when switching from "all"; a custom selection is never wiped.
            else if (allSelected) setSelected(new Set());
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          {[
            { value: "all", on: allSelected, label: t("wizard.members.scopeAll", { count: members.length }), hint: t("wizard.members.scopeAllHint") },
            { value: "some", on: !allSelected, label: t("wizard.members.scopeSome"), hint: t("wizard.members.scopeSomeHint") },
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
          <span className="font-semibold">{t(selected.size === 1 ? "wizard.members.selectedCountOne" : "wizard.members.selectedCount", { count: selected.size })}</span>
          {!voluntary && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>
                <b className="tabular-nums">{payingCount}</b> {t("wizard.members.payingCount")}
              </span>
              {exemptCount > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>{t("wizard.members.exemptCount", { count: exemptCount })}</span>
                </>
              )}
            </>
          )}
        </div>

        <Toolbar
          search={<SearchInput id="wz-member-search" value={query} onChange={setQuery} placeholder={t("wizard.members.searchPlaceholder")} />}
          tabs={<FilterPills label={t("wizard.members.categoryFilter")} value={category} onChange={setCategory} options={categories} />}
        />

        {!voluntary && (
          <div className="grid gap-1.5 rounded-xl border border-dashed border-border p-3">
            <Label htmlFor="wz-bulk" className="text-xs text-muted-foreground">
              {t(visibleSelected.length === 1 ? "wizard.members.bulkLabelOne" : "wizard.members.bulkLabel", { count: visibleSelected.length })}
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
                {t("wizard.members.bulkApply")}
              </Button>
            </div>
            {bulkError && <p className="text-xs font-medium text-st-unpaid">{bulkError}</p>}
          </div>
        )}

        {members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {t("wizard.members.noActive")}
          </p>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border">
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border bg-primary-tint px-3 text-xs font-semibold text-muted-foreground">
              <Checkbox checked={allVisibleSelected ? true : visibleSelected.length ? "indeterminate" : false} onCheckedChange={(value) => toggleVisible(value === true)} />
              {allVisibleSelected ? t("wizard.members.deselectAllVisible") : t("wizard.members.selectAllVisible")} ({visible.length})
            </label>
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("wizard.members.noMatch")}</p>
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
  const t = useT();
  const checkboxId = `wz-m-${member.id}`;
  return (
    <li className={cn("grid gap-2.5 px-3 py-3", on ? "bg-card" : "bg-muted/40")}>
      <div className="flex min-w-0 items-center gap-3">
        <Checkbox id={checkboxId} checked={on} onCheckedChange={(value) => onToggle(value === true)} className="size-5" />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium break-words">{member.name}</span>
          <span className="block text-xs text-muted-foreground">{member.category ? categoryLabels[member.category] : t("wizard.members.noCategory")}</span>
        </label>
        {on && !voluntary && exemption.on && <StatusChip label={t("labels.status.exempt")} tone="exempt" compact />}
        {on && !voluntary && !exemption.on && override.trim() && <StatusChip label={t("wizard.members.specialAmount")} tone="brand" compact />}
      </div>

      {on && !voluntary && (
        <div className="grid gap-2 pl-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {!exemption.on && (
              <div className="flex min-w-0 items-center gap-1.5">
                <MoneyInput
                  aria-label={t(monthly ? "wizard.members.amountMonthlyAria" : "wizard.members.amountAria", { name: member.name })}
                  value={override}
                  onChange={(event) => setOverride(event.target.value)}
                  placeholder={defaultSen !== null ? senToInput(defaultSen) : t("wizard.members.defaultPlaceholder")}
                  invalid={Boolean(error)}
                  className="w-36 min-w-0"
                />
                {override.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setOverride("")} className="h-11">
                    <RotateCcw /> {t("wizard.members.resetToDefault")}
                  </Button>
                )}
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <Switch checked={exemption.on} onCheckedChange={(value) => setExemption({ ...exemption, on: value })} aria-label={t("wizard.members.exemptAria", { name: member.name })} />
              {t("wizard.members.exempt")}
            </label>
          </div>
          {exemption.on && (
            <Input
              value={exemption.reason}
              onChange={(event) => setExemption({ ...exemption, reason: event.target.value })}
              placeholder={t("wizard.members.reasonPlaceholder")}
              aria-label={t("wizard.members.reasonAria", { name: member.name })}
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
  const t = useT();
  const voluntary = details.type === "voluntary";
  const due =
    details.type === "one_off"
      ? details.dueDate
        ? formatDay(details.dueDate)
        : t("wizard.details.noDeadline")
      : details.type === "monthly"
        ? details.dueDay.trim()
          ? t("wizard.review.dueMonthly", { day: Number(details.dueDay) })
          : t("wizard.details.noDeadline")
        : t("wizard.details.noDeadline");

  return (
    <div className="grid gap-4">
      <SectionCard
        title={t("wizard.review.detailsTitle")}
        icon={FileText}
        action={
          <Button variant="outline" size="sm" onClick={() => onEdit(0)}>
            {t("wizard.review.edit")}
          </Button>
        }
      >
        <DetailList
          items={[
            {
              label: t("wizard.review.name"),
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <CollectionIcon icon={iconOf(details)} type={details.type} size="sm" />
                  {details.name.trim()}
                </span>
              ),
            },
            { label: t("wizard.review.type"), value: collectionTypeLabels[details.type] },
            {
              label: t("wizard.review.defaultAmount"),
              value: voluntary
                ? t("wizard.review.anyAmount")
                : defaultSen !== null
                  ? t(details.type === "monthly" ? "wizard.review.perMonthly" : "wizard.review.perPerson", { amount: formatMoney(defaultSen) })
                  : "—",
            },
            ...(details.type === "monthly"
              ? [{
                  label: t("wizard.review.period"),
                  value: months.length
                    ? t(months.length === 1 ? "wizard.review.periodValueOne" : "wizard.review.periodValue", {
                        from: formatMonth(months[0]),
                        to: formatMonth(months[months.length - 1]),
                        count: months.length,
                      })
                    : "—",
                }]
              : []),
            { label: t("wizard.review.dueDate"), value: due },
            { label: t("wizard.review.description"), value: details.description.trim() },
            { label: t("wizard.review.notes"), value: details.notes.trim() },
          ]}
        />
      </SectionCard>

      <SectionCard
        title={voluntary ? t("wizard.review.invitedTitle", { count: paying.length }) : t("wizard.review.payingTitle", { count: paying.length })}
        icon={UsersRound}
        action={
          <Button variant="outline" size="sm" onClick={() => onEdit(1)}>
            {t("wizard.review.edit")}
          </Button>
        }
      >
        {paying.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("wizard.review.noMembers")}</p>
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
                      {details.type === "monthly" && <span className="text-xs font-normal text-muted-foreground"> {t("wizard.review.perMonthShort")}</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {exempt.length > 0 && (
        <SectionCard title={t("wizard.review.exemptTitle", { count: exempt.length })} description={t("wizard.review.exemptDescription")}>
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
            <b>{t("wizard.review.noExpectedTitle")}</b> {t("wizard.review.noExpectedBody")}
          </p>
        ) : (
          <>
            <p className="text-[13px] font-medium text-muted-foreground">{t("wizard.review.expectedTotal")}</p>
            <p className="mt-0.5 text-[26px] leading-tight font-bold tracking-[-.02em] tabular-nums">{expectedTotal !== null ? formatMoney(expectedTotal) : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                t(paying.length === 1 ? "wizard.review.summaryMembersOne" : "wizard.review.summaryMembers", { count: paying.length }),
                ...(details.type === "monthly" && perPeriodTotal !== null
                  ? [t("wizard.review.summaryMonthly", { amount: formatMoney(perPeriodTotal), months: months.length })]
                  : []),
                ...(exempt.length > 0 ? [t("wizard.review.summaryExempt", { count: exempt.length })] : []),
              ].join(" · ")}
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
  const t = useT();
  const voluntary = details.type === "voluntary";
  return (
    <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label={t("wizard.summary.title")}>
      <SectionCard title={t("wizard.summary.title")}>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("wizard.summary.name")}</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1.5 font-medium">
              {details.name.trim() && <CollectionIcon icon={iconOf(details)} type={details.type} size="xs" />}
              <span className="truncate">{details.name.trim() || "—"}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("wizard.summary.type")}</dt>
            <dd className="text-right">{collectionTypeLabels[details.type]}</dd>
          </div>
          {!voluntary && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("wizard.summary.defaultAmount")}</dt>
              <dd className="text-right tabular-nums">{defaultSen !== null ? <Money sen={defaultSen} /> : "—"}</dd>
            </div>
          )}
          {details.type === "monthly" && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("wizard.summary.period")}</dt>
              <dd className="text-right tabular-nums">{months ? t(months === 1 ? "wizard.summary.periodValueOne" : "wizard.summary.periodValue", { count: months }) : "—"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("wizard.summary.chosen")}</dt>
            <dd className="text-right tabular-nums">
              {chosen}
              {exempt > 0 && <span className="text-muted-foreground"> {t("wizard.summary.chosenExempt", { count: exempt })}</span>}
            </dd>
          </div>
          <div className="mt-1 border-t border-border pt-2.5">
            <dt className="text-xs text-muted-foreground">{voluntary ? t("wizard.summary.expectedTotal") : t(paying === 1 ? "wizard.summary.expectedTotalMembersOne" : "wizard.summary.expectedTotalMembers", { count: paying })}</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums">{voluntary ? t("wizard.summary.none") : expectedTotal !== null ? formatMoney(expectedTotal) : "—"}</dd>
          </div>
        </dl>
      </SectionCard>
    </aside>
  );
}
