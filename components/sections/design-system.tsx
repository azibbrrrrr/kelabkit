"use client";

import { ChoiceCard, ChoiceCards, SegmentedChoice } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { usePrefs } from "@/components/prefs-provider";
import { MoneyInput } from "@/components/money-input";
import { EmptyState, ErrorState, PageHeader, PageShell, SectionCard, StatusChip, TableSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cellStatusLabels, overdueLabel, pendingLabel, type CellStatus } from "@/lib/labels";
import { today } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { themes, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check, Inbox, Palette, Plus, Search, Type } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// The KelabKit design system on one page, mirroring the Concept 04 reference panel. Every
// swatch reads the live CSS variable, so switching the theme here shows the real tokens.

const tokens: [string, string][] = [
  ["Primary", "--primary"],
  ["Primary Fill", "--primary-fill"],
  ["Primary Light", "--primary-light"],
  ["Primary Tint", "--primary-tint"],
  ["Primary Strong", "--primary-strong"],
  ["Surface", "--card"],
  ["Border", "--border"],
  ["Text", "--foreground"],
  ["Background", "--background"],
  ["Success", "--success"],
  ["Warning", "--warning"],
  ["Error", "--destructive"],
  ["Info", "--info"],
];

export function DesignSystemPage() {
  const t = useT();
  const { theme, floral, setPrefs } = usePrefs();
  const type: [string, string, string, string][] = [
    ["H1", t("designSystem.type.h1"), "28 / Bold", "text-[28px] font-bold"],
    ["H2", t("designSystem.type.h2"), "20 / Semibold", "text-[20px] font-semibold"],
    ["H3", t("designSystem.type.h3"), "15 / Semibold", "text-[15px] font-semibold"],
    ["Body", t("designSystem.type.body"), "14 / Regular", "text-sm"],
    ["Small", t("designSystem.type.small"), "12 / Regular", "text-xs text-muted-foreground"],
  ];
  const statuses: CellStatus[] = ["paid", "partial", "unpaid", "exempt", "na", "future"];
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");

  return (
    <PageShell>
      <PageHeader title={t("designSystem.title")} description={t("designSystem.description")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("designSystem.colors.title")} icon={Palette} description={t("designSystem.colors.description")}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {tokens.map(([label, variable]) => (
              <div key={variable} className="min-w-0">
                <div className="h-12 rounded-xl border border-border" style={{ background: `var(${variable})` }} />
                <p className="mt-1.5 truncate text-xs font-medium">{label}</p>
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">{variable}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.type.title")} icon={Type} description={t("designSystem.type.description")}>
          <div className="flex gap-5">
            <div className="hidden shrink-0 border-r border-border pr-5 sm:block">
              <p className="text-[54px] leading-none font-bold">Aa</p>
              <p className="mt-2 text-lg font-semibold">Inter</p>
            </div>
            <dl className="grid flex-1 gap-2.5">
              {type.map(([tag, sample, spec, cls]) => (
                <div key={tag} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2">
                  <dt className="text-xs font-semibold text-muted-foreground">{tag}</dt>
                  <dd className={cn("truncate", cls)}>{sample}</dd>
                  <dd className="text-[11px] text-muted-foreground">{spec}</dd>
                </div>
              ))}
            </dl>
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.buttons.title")}>
          <div className="flex flex-wrap gap-2">
            <Button>{t("designSystem.buttons.primary")}</Button>
            <Button variant="secondary">{t("designSystem.buttons.secondary")}</Button>
            <Button variant="brand">{t("designSystem.buttons.outlineBrand")}</Button>
            <Button variant="outline">{t("designSystem.buttons.neutral")}</Button>
            <Button variant="ghost">{t("designSystem.buttons.ghost")}</Button>
            <Button variant="danger-outline">{t("designSystem.buttons.danger")}</Button>
            <Button>
              <Plus /> {t("designSystem.buttons.icon")}
            </Button>
            <Button disabled>{t("designSystem.buttons.disabled")}</Button>
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.inputs.title")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("designSystem.inputs.normal")}
              <Input placeholder={t("designSystem.inputs.memberName")} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("designSystem.inputs.focus")}
              <Input placeholder={t("designSystem.inputs.memberName")} className="border-ring shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_20%,transparent)]" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("designSystem.inputs.amount")}
              <MoneyInput placeholder="25.00" />
            </label>
            <div className="grid gap-1 text-xs text-muted-foreground">
              {t("designSystem.inputs.choice")}
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("designSystem.inputs.choosePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guru">{t("designSystem.inputs.teacher")}</SelectItem>
                  <SelectItem value="kakitangan">{t("designSystem.inputs.staff")}</SelectItem>
                  <SelectItem value="lain">{t("designSystem.inputs.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="relative grid gap-1 text-xs text-muted-foreground sm:col-span-2">
              {t("designSystem.inputs.search")}
              <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4" />
              <Input type="search" placeholder={t("designSystem.inputs.searchPlaceholder")} className="pl-9" />
            </label>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("designSystem.inputs.date")}</span>
              <DatePicker value={day} onChange={setDay} max={today()} aria-label={t("designSystem.inputs.dateExample")} />
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("designSystem.inputs.month")}</span>
              <MonthPicker value={month} onChange={setMonth} />
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
              <span>{t("designSystem.inputs.segmented")}</span>
              <SegmentedChoice label={t("designSystem.inputs.segmentedLabel")} value={method} onChange={setMethod} options={[{ value: "cash", label: t("designSystem.inputs.cash") }, { value: "transfer", label: t("designSystem.inputs.transfer") }, { value: "other", label: t("designSystem.inputs.other") }]} />
            </div>
            <p className="text-xs font-medium text-st-unpaid sm:col-span-2">{t("designSystem.inputs.errorExample")}</p>
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.checks.title")}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox defaultChecked /> {t("designSystem.checks.selected")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox /> {t("designSystem.checks.unselected")}
            </label>
            <RadioGroup defaultValue="a" className="flex gap-5">
              <label className="flex items-center gap-2">
                <RadioGroupItem value="a" /> {t("designSystem.checks.optionA")}
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="b" /> {t("designSystem.checks.optionB")}
              </label>
            </RadioGroup>
            <label className="flex items-center gap-2">
              <Switch checked={floral} onCheckedChange={(value) => setPrefs({ floral: value })} /> {t("designSystem.checks.floral")}
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.chips.title")} description={t("designSystem.chips.description")}>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusChip key={status} label={cellStatusLabels[status][0]} tone={cellStatusLabels[status][1]} />
            ))}
            <StatusChip label={overdueLabel[0]} tone={overdueLabel[1]} />
            <StatusChip label={pendingLabel[0]} tone={pendingLabel[1]} />
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.rows.title")}>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
              <Checkbox /> {t("designSystem.rows.normal")}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-primary-tint/60 px-3 py-2.5">
              <Checkbox /> {t("designSystem.rows.hover")}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-tint px-3 py-2.5">
              <Checkbox defaultChecked /> {t("designSystem.rows.selected")}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-muted-foreground opacity-60">
              <Checkbox disabled /> {t("designSystem.rows.disabled")}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("designSystem.themes.title")} description={t("designSystem.themes.description")}>
          <ChoiceCards label={t("designSystem.themes.title")} value={theme} onChange={(id) => setPrefs({ theme: id as ThemeId })} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {themes.map((option) => (
              <ChoiceCard key={option.id} value={option.id} checked={theme === option.id} className="min-h-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-foreground">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: option.fill }}>
                  {theme === option.id && <Check className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{option.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{option.mood}</span>
                </span>
              </ChoiceCard>
            ))}
          </ChoiceCards>
        </SectionCard>

        <SectionCard title={t("designSystem.states.title")} className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <EmptyState icon={Inbox} title={t("designSystem.states.emptyTitle")} description={t("designSystem.states.emptyDescription")} className="py-6" />
            <div className="rounded-2xl border border-border p-4">
              <TableSkeleton rows={4} />
            </div>
            <div className="grid min-w-0 grid-cols-1 content-start gap-3">
              <ErrorState title={t("designSystem.states.errorTitle")} description={t("designSystem.states.errorDescription")} action={<Button size="sm" variant="brand">{t("designSystem.states.retry")}</Button>} />
              <Button variant="outline" onClick={() => toast.success(t("designSystem.states.toast"))}>
                {t("designSystem.states.showToast")}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
