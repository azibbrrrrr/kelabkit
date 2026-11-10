"use client";

import { CollectionName } from "@/components/collection-icon";
import { useSnapshot } from "@/components/data-provider";
import { EmptyState, FilterPills, LabelChip, Money, PageHeader, PageShell, SectionCard, StatusChip } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDay, formatMoney, formatMonth, waNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { cellStatusLabels, overdueLabel } from "@/lib/labels";
import { sum } from "@/lib/money/amount";
import type { ChargeLedger } from "@/lib/money/ledger";
import type { Club, Collection, Day, Member, Sen } from "@/lib/types";
import { sortCollections } from "@/lib/view";
import { cn } from "@/lib/utils";
import { CheckCheck, ChevronDown, Copy, Info, MessageCircle, MessageSquareText, RotateCcw, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Polite follow-up. Lists members who still owe on one mandatory collection, drafts a
// message per member from an editable template, and hands it to the clipboard or to
// WhatsApp. Nothing is sent automatically. Amounts come from the ledgers in lib/view:
// "baki" is required − confirmed; pending money is shown as "menunggu semakan", never
// as paid.

type Filter = "unpaid" | "partial" | "overdue" | "all";
type Placeholder = "nama" | "kutipan" | "baki" | "tarikh" | "bendahari" | "kelab";

const PLACEHOLDERS: Placeholder[] = ["nama", "kutipan", "baki", "tarikh", "bendahari", "kelab"];

// The message sent to members is always Bahasa Melayu, whatever language the interface shows, so
// its dates use fixed Malay month names rather than the locale-aware helpers in lib/format.
const MS_MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const msDay = (day: Day) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MS_MONTHS[m - 1]} ${y}`;
};
const msMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${MS_MONTHS[m - 1]} ${y}`;
};

const DEFAULT_TEMPLATE = `Assalamualaikum dan salam sejahtera {nama},

Ini peringatan mesra tentang {kutipan}. Baki yang masih belum dijelaskan ialah {baki}.
Tarikh akhir bayaran: {tarikh}.

Jika sudah membuat bayaran, mohon abaikan mesej ini dan maklumkan kepada saya supaya rekod dapat dikemas kini. Terima kasih atas kerjasama.

{bendahari}
Bendahari, {kelab}`;

const TEMPLATE_KEY = "kelabkit-reminder-template-v1";

type Row = {
  member: Member;
  ledgers: ChargeLedger[];
  remaining: Sen;
  pending: Sen;
  overdue: boolean;
  hasUnpaid: boolean;
  hasPartial: boolean;
  /** Earliest due date among the charges still owing. */
  dueDate: Day | null;
  months: string[];
};

/**
 * Fills a template. A line that uses {tarikh} is dropped when there is no due date, and a
 * note about money awaiting review follows the {baki} line, so the message never claims
 * a pending payment as received.
 */
function fillTemplate(template: string, values: Record<Placeholder, string>, hasDate: boolean, pendingNote: string | null) {
  const out: string[] = [];
  for (const line of template.split("\n")) {
    if (!hasDate && line.includes("{tarikh}")) continue;
    out.push(line.replace(/\{(nama|kutipan|baki|tarikh|bendahari|kelab)\}/g, (_, key: Placeholder) => values[key]));
    if (pendingNote && line.includes("{baki}")) out.push(pendingNote);
  }
  if (pendingNote && !template.includes("{baki}")) out.push("", pendingNote);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pendingNoteFor(pending: Sen) {
  return pending > 0
    ? `Saya juga telah menerima makluman bayaran ${formatMoney(pending)} yang masih dalam semakan. Baki di atas akan dikemas kini setelah bayaran itu disahkan.` // i18n-ok: message sent to members
    : null;
}

function groupMessage(club: Club, kutipan: string, dueDate: Day | null) {
  const when = dueDate ? `sebelum ${msDay(dueDate)}` : "secepat mungkin";
  return [
    "Assalamualaikum dan salam sejahtera semua,",
    "",
    `Ini peringatan mesra tentang ${kutipan}. Kepada ahli yang belum menjelaskan bayaran, mohon jelaskan ${when}.`,
    "Bayaran boleh diserahkan secara tunai atau melalui pindahan bank kepada saya.", // i18n-ok: message sent to members
    "",
    "Kepada yang sudah membayar, terima kasih dan mohon abaikan mesej ini.",
    "",
    club.treasurerName,
    `Bendahari, ${club.name}`,
  ].join("\n");
}

/** Copies text with the async Clipboard API, falling back to a hidden textarea. */
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused: try the fallback below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

async function copyWithToast(text: string, success: string, failure: string) {
  if (await copyText(text)) toast.success(success);
  else toast.error(failure);
}

export function RemindersPage() {
  const t = useT();
  const { data, view } = useSnapshot();

  const mandatory = useMemo(
    () => sortCollections(data.collections).filter((c) => c.status === "active" && c.type !== "voluntary"),
    [data.collections],
  );
  const voluntary = data.collections.filter((c) => c.status === "active" && c.type === "voluntary");

  const owingRowsFor = (collection: Collection, periodId: string | null): Row[] => {
    const byMember = new Map<string, ChargeLedger[]>();
    for (const charge of view.chargesByCollection.get(collection.id) ?? []) {
      if (periodId && charge.periodId !== periodId) continue;
      const ledger = view.ledgers.get(charge.id);
      // Exempt, settled and future-month charges are not owed now.
      if (!ledger || ledger.status === "exempt" || ledger.future || ledger.remaining <= 0) continue;
      const member = view.membersById.get(charge.memberId);
      if (!member?.active) continue;
      const list = byMember.get(member.id);
      if (list) list.push(ledger);
      else byMember.set(member.id, [ledger]);
    }
    const periods = view.periodsByCollection.get(collection.id) ?? [];
    const monthOfPeriod = new Map(periods.map((period) => [period.id, period.month]));
    const rows: Row[] = [];
    for (const [memberId, ledgers] of byMember) {
      const dates = ledgers.map((l) => l.charge.dueDate).filter((d): d is Day => Boolean(d)).sort();
      rows.push({
        member: view.membersById.get(memberId)!,
        ledgers,
        remaining: sum(ledgers.map((l) => l.remaining)),
        pending: sum(ledgers.map((l) => l.pending)),
        overdue: ledgers.some((l) => l.overdue),
        hasUnpaid: ledgers.some((l) => l.status === "unpaid"),
        hasPartial: ledgers.some((l) => l.status === "partial"),
        dueDate: dates[0] ?? null,
        months: ledgers
          .map((l) => (l.charge.periodId ? monthOfPeriod.get(l.charge.periodId) : undefined))
          .filter((m): m is string => Boolean(m))
          .sort(),
      });
    }
    return rows.sort((a, b) => a.member.name.localeCompare(b.member.name, "ms"));
  };

  const [collectionId, setCollectionId] = useState<string | null>(null);
  const defaultId = useMemo(
    () => mandatory.find((c) => owingRowsFor(c, null).length > 0)?.id ?? mandatory[0]?.id ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- owingRowsFor reads view
    [mandatory, view],
  );
  const collection = mandatory.find((c) => c.id === collectionId) ?? mandatory.find((c) => c.id === defaultId) ?? null;

  const [periodId, setPeriodId] = useState<string>("all");
  const periodOptions = useMemo(() => {
    if (!collection || collection.type !== "monthly") return [];
    const thisMonth = view.today.slice(0, 7);
    return (view.periodsByCollection.get(collection.id) ?? []).filter((period) => period.month <= thisMonth);
  }, [collection, view]);
  const period = periodOptions.find((p) => p.id === periodId) ?? null;

  const [filter, setFilter] = useState<Filter>("all");

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TEMPLATE_KEY);
      if (saved) setTemplate(saved);
    } catch {
      // Blocked storage: the default template is used.
    }
    setTemplateLoaded(true);
  }, []);
  useEffect(() => {
    if (!templateLoaded) return;
    try {
      if (template === DEFAULT_TEMPLATE) window.localStorage.removeItem(TEMPLATE_KEY);
      else window.localStorage.setItem(TEMPLATE_KEY, template);
    } catch {
      // Blocked storage: the template lasts for this visit.
    }
  }, [template, templateLoaded]);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const allRows = useMemo(
    () => (collection ? owingRowsFor(collection, period?.id ?? null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- owingRowsFor reads view
    [collection, period, view],
  );
  const counts = {
    unpaid: allRows.filter((r) => r.hasUnpaid).length,
    partial: allRows.filter((r) => r.hasPartial).length,
    overdue: allRows.filter((r) => r.overdue).length,
    all: allRows.length,
  };
  const rows = allRows.filter((r) =>
    filter === "unpaid" ? r.hasUnpaid : filter === "partial" ? r.hasPartial : filter === "overdue" ? r.overdue : true,
  );

  // `forMessage` keeps the month names in Bahasa Melayu for the text sent to members.
  const kutipanLabel = (row: Row | null, forMessage = true) => {
    if (!collection) return "";
    const month = forMessage ? msMonth : (m: string) => formatMonth(m);
    if (period) return `${collection.name} (${month(period.month)})`;
    if (row && row.months.length) return `${collection.name} (${row.months.map((m) => month(m)).join(", ")})`;
    return collection.name;
  };

  const messageFor = (row: Row) =>
    fillTemplate(
      template,
      {
        nama: row.member.name,
        kutipan: kutipanLabel(row),
        baki: formatMoney(row.remaining),
        tarikh: row.dueDate ? msDay(row.dueDate) : "",
        bendahari: data.club.treasurerName,
        kelab: data.club.name,
      },
      Boolean(row.dueDate),
      pendingNoteFor(row.pending),
    );

  const scopeKey = `${collection?.id ?? ""}|${period?.id ?? "all"}`;
  const editKey = (row: Row) => `${scopeKey}|${row.member.id}`;
  const currentMessage = (row: Row) => edits[editKey(row)] ?? messageFor(row);

  // The group note names a date only when it is still ahead; a passed date reads as a scold.
  const groupDue = (() => {
    const due = period ? period.dueDate : collection?.type === "one_off" ? collection.dueDate : null;
    return due && due >= view.today ? due : null;
  })();
  const groupText = collection ? groupMessage(data.club, kutipanLabel(null), groupDue) : "";

  const templateRef = useRef<HTMLTextAreaElement>(null);
  const templateId = useId();
  const insertPlaceholder = (key: Placeholder) => {
    const token = `{${key}}`;
    const el = templateRef.current;
    if (!el) {
      setTemplate((current) => current + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const totalRemaining = sum(rows.map((r) => r.remaining));
  const [showGroup, setShowGroup] = useState(false);

  return (
    <PageShell>
      <PageHeader
        title={t("reminders.title")}
        description={t("reminders.description")}
      />

      {mandatory.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title={t("reminders.empty.title")}
          description={t("reminders.empty.description")}
          action={
            <Button asChild>
              <Link href="/kutipan/baru/">{t("reminders.empty.action")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <SectionCard
            title={t("reminders.template.title")}
            icon={MessageSquareText}
            description={t("reminders.template.description")}
            action={
              <Button variant="danger-outline" size="sm" onClick={() => setTemplate(DEFAULT_TEMPLATE)} disabled={template === DEFAULT_TEMPLATE}>
                <RotateCcw /> {t("reminders.template.reset")}
              </Button>
            }
          >
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-1.5" aria-label={t("reminders.template.placeholdersLabel")}>
                {PLACEHOLDERS.map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => insertPlaceholder(p)}
                    title={t(`reminders.placeholderHints.${p}`)}
                    className="rounded-lg bg-primary-tint px-2.5 font-mono text-xs text-primary-strong hover:bg-primary-light hover:text-primary-strong"
                  >
                    {`{${p}}`}
                  </Button>
                ))}
              </div>
              <Label htmlFor={templateId} className="sr-only">
                {t("reminders.template.label")}
              </Label>
              <Textarea
                id={templateId}
                ref={templateRef}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                rows={9}
                className="min-h-40 leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                {t("reminders.template.savedNote")}
              </p>
            </div>
          </SectionCard>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
              <div className="grid min-w-0 gap-1.5 sm:w-72">
                <Label htmlFor="rem-collection">{t("reminders.filters.collection")}</Label>
                <Select
                  value={collection?.id}
                  onValueChange={(value) => {
                    setCollectionId(value);
                    setPeriodId("all");
                  }}
                >
                  <SelectTrigger id="rem-collection" className="w-full">
                    <SelectValue placeholder={t("reminders.filters.collectionPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {mandatory.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <CollectionName collection={c} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {collection?.type === "monthly" && (
                <div className="grid min-w-0 gap-1.5 sm:w-56">
                  <Label htmlFor="rem-month">{t("reminders.filters.month")}</Label>
                  <Select value={period?.id ?? "all"} onValueChange={setPeriodId}>
                    <SelectTrigger id="rem-month" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("reminders.filters.allMonths")}</SelectItem>
                      {periodOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatMonth(p.month)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <FilterPills<Filter>
              label={t("reminders.filters.label")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "unpaid", label: t("reminders.filters.unpaid"), count: counts.unpaid },
                { value: "partial", label: t("reminders.filters.partial"), count: counts.partial },
                { value: "overdue", label: t("reminders.filters.overdue"), count: counts.overdue },
                { value: "all", label: t("reminders.filters.all"), count: counts.all },
              ]}
            />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {t("reminders.scopeNote")}
                {voluntary.length > 0 && ` ${t("reminders.voluntaryNote", { names: voluntary.map((c) => c.name).join(", ") })}`}
              </span>
            </p>
          </div>

          {allRows.length === 0 ? (
            <EmptyState
              icon={CheckCheck}
              title={t("reminders.allPaid.title")}
              description={t("reminders.allPaid.description", { collection: kutipanLabel(null, false) })}
            />
          ) : (
            <>
              <SectionCard
                title={t("reminders.group.title")}
                icon={UsersRound}
                description={t("reminders.group.description")}
                action={
                  <Button size="sm" onClick={() => void copyWithToast(groupText, t("reminders.group.copied"), t("reminders.copyFailed"))}>
                    <Copy /> {t("reminders.group.copyAll")}
                  </Button>
                }
              >
                <Button
                  variant="link"
                  size="xs"
                  onClick={() => setShowGroup((v) => !v)}
                  aria-expanded={showGroup}
                  className="px-0"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", showGroup && "rotate-180")} aria-hidden />
                  {showGroup ? t("reminders.group.hide") : t("reminders.group.show")}
                </Button>
                {showGroup && (
                  <pre className="mt-2 rounded-xl border border-border bg-primary-tint/60 p-3 font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap">
                    {groupText}
                  </pre>
                )}
              </SectionCard>

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">
                  {t("reminders.summary.membersBalance", { count: rows.length })} <Money sen={totalRemaining} />
                </h2>
                <p className="text-xs text-muted-foreground">{t("reminders.summary.reviewHint")}</p>
              </div>

              {rows.length === 0 ? (
                <EmptyState icon={CheckCheck} title={t("reminders.noneInFilter.title")} description={t("reminders.noneInFilter.description")} />
              ) : (
                <ul className="grid gap-3">
                  {rows.map((row) => {
                    const key = editKey(row);
                    const message = currentMessage(row);
                    const edited = edits[key] !== undefined;
                    const number = waNumber(row.member.phone);
                    const isOpen = open[key] ?? false;
                    return (
                      <li key={row.member.id} className="min-w-0 rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium break-words">{row.member.name}</p>
                            <p className="mt-0.5 text-xs break-words text-muted-foreground">
                              {row.months.length > 0 && !period && `${row.months.map((m) => formatMonth(m, false)).join(", ")} · `}
                              {row.dueDate ? t("reminders.row.dueDate", { date: formatDay(row.dueDate) }) : t("reminders.row.noDueDate")}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-muted-foreground">{t("reminders.row.balance")}</div>
                            <Money sen={row.remaining} className="font-semibold" />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.hasUnpaid && <LabelChip entry={cellStatusLabels.unpaid} compact />}
                          {row.hasPartial && <LabelChip entry={cellStatusLabels.partial} compact />}
                          {row.overdue && <LabelChip entry={overdueLabel} compact />}
                          {row.pending > 0 && <StatusChip tone="pending" label={t("reminders.row.pending", { amount: formatMoney(row.pending) })} compact />}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => void copyWithToast(message, t("reminders.row.copiedFor", { name: row.member.name }), t("reminders.copyFailed"))}>
                            <Copy /> {t("reminders.row.copyMessage")}
                          </Button>
                          {number ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                                <MessageCircle /> {t("reminders.row.openWhatsapp")}
                              </a>
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Button size="sm" variant="outline" disabled aria-describedby={`${key}-nophone`}>
                                <MessageCircle /> {t("reminders.row.openWhatsapp")}
                              </Button>
                              <span id={`${key}-nophone`} className="text-xs text-muted-foreground">
                                {row.member.phone ? t("reminders.row.phoneInvalid") : t("reminders.row.phoneMissing")}
                              </span>
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={isOpen}
                            onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                          >
                            <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                            {isOpen ? t("reminders.row.closeMessage") : t("reminders.row.viewEdit")}
                          </Button>
                        </div>
                        {isOpen && (
                          <div className="mt-3 grid gap-2">
                            <Label htmlFor={`${key}-msg`} className="text-xs text-muted-foreground">
                              {t(edited ? "reminders.row.messageForEdited" : "reminders.row.messageFor", { name: row.member.name })}
                            </Label>
                            <Textarea
                              id={`${key}-msg`}
                              value={message}
                              onChange={(event) => setEdits((e) => ({ ...e, [key]: event.target.value }))}
                              rows={9}
                              className="leading-relaxed"
                            />
                            {edited && (
                              <div>
                                <Button
                                  size="sm"
                                  variant="danger-outline"
                                  onClick={() =>
                                    setEdits((e) => {
                                      const next = { ...e };
                                      delete next[key];
                                      return next;
                                    })
                                  }
                                >
                                  <RotateCcw /> {t("reminders.row.useTemplateAgain")}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
