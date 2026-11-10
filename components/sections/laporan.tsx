"use client";

import { useSnapshot } from "@/components/data-provider";
import { EmptyState, FilterPills, LabelChip, PageHeader, PageShell, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDay, formatMoney, formatMonth, today as todayDay } from "@/lib/format";
import {
  categoryLabels,
  cellStatusLabels,
  collectionStatusLabels,
  collectionTypeLabels,
  methodLabels,
  overdueLabel,
  pendingLabel,
  paymentStateLabels,
  type Tone,
} from "@/lib/labels";
import { senToInput, sum } from "@/lib/money/amount";
import { totalsOf, voluntaryReceived, type ChargeLedger } from "@/lib/money/ledger";
import type { Allocation, Collection, Payment, PaymentState, Sen, Snapshot } from "@/lib/types";
import { cellStatus, sortCollections, type View } from "@/lib/view";
import { cn } from "@/lib/utils";
import { Download, FileText, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

// Reports. Each report is built once as a plain model (columns, rows, totals, summary)
// from lib/view and lib/money, and both the on-screen table and the CSV are rendered
// from that same model, so an export always equals what the treasurer sees.

type ReportKind = "kutipan" | "ahli" | "belum" | "bulanan" | "sejarah";
type ColKind = "text" | "money" | "count" | "status";
type Chip = [string, Tone];
type Value = string | number | Chip[] | null;
/** `low` columns drop out of the on-screen table when it is narrow; print, CSV and phone cards keep them. */
type Col = { key: string; label: string; kind: ColKind; low?: boolean };
type Report = {
  title: string;
  scope: string;
  columns: Col[];
  rows: { key: string; values: Record<string, Value> }[];
  totals: Record<string, Value> | null;
  summary: { label: string; sen: Sen }[];
  empty: string;
  footnote?: string;
};

const REPORTS: { value: ReportKind; label: string }[] = [
  { value: "kutipan", label: "Ringkasan kutipan" },
  { value: "ahli", label: "Ringkasan ahli" },
  { value: "belum", label: "Ahli belum bayar / sebahagian" },
  { value: "bulanan", label: "Laporan bulanan" },
  { value: "sejarah", label: "Sejarah bayaran" },
];

const ALL = "all";

// Rendering -------------------------------------------------------------------------------

function screenText(col: Col, value: Value) {
  if (value === null || value === undefined) return "—";
  if (col.kind === "money") return formatMoney(value as number);
  if (col.kind === "status") return (value as Chip[]).map((chip) => chip[0]).join(", ");
  return String(value);
}

function csvText(col: Col, value: Value) {
  if (value === null || value === undefined) return "";
  if (col.kind === "money") return senToInput(value as number);
  if (col.kind === "status") return (value as Chip[]).map((chip) => chip[0]).join(", ");
  return String(value);
}

/** RFC 4180 quoting, plus a guard so a name like "=SUM(…)" is never run as a formula. */
function csvField(raw: string, isText = true) {
  const value = isText && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildCsv(report: Report, header: [string, string][]) {
  const lines: string[] = [];
  lines.push(csvField(`KelabKit: ${report.title}`));
  for (const [label, value] of header) lines.push(`${csvField(label)},${csvField(value)}`);
  for (const item of report.summary) lines.push(`${csvField(item.label)},${senToInput(item.sen)}`);
  lines.push("");
  lines.push(report.columns.map((col) => csvField(col.label)).join(","));
  for (const row of report.rows)
    lines.push(report.columns.map((col) => csvField(csvText(col, row.values[col.key] ?? null), col.kind === "text")).join(","));
  if (report.totals)
    lines.push(report.columns.map((col) => csvField(csvText(col, report.totals![col.key] ?? null), col.kind === "text")).join(","));
  if (report.footnote) lines.push("", csvField(report.footnote));
  // A byte-order mark makes Excel read the file as UTF-8, so Malay text and "—" survive.
  return `﻿${lines.join("\r\n")}\r\n`;
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Builders --------------------------------------------------------------------------------

const money = (key: string, label: string): Col => ({ key, label, kind: "money" });
const count = (key: string, label: string): Col => ({ key, label, kind: "count" });
const text = (key: string, label: string): Col => ({ key, label, kind: "text" });
const status = (key: string, label: string): Col => ({ key, label, kind: "status" });
const low = (col: Col): Col => ({ ...col, low: true });

function voluntaryPending(payments: Payment[], collectionId: string, memberId?: string) {
  return sum(
    payments
      .filter((p) => p.collectionId === collectionId && p.state === "pending" && (memberId === undefined || p.memberId === memberId))
      .map((p) => p.amount),
  );
}

function memberLabel(view: View, memberId: string) {
  const member = view.membersById.get(memberId);
  if (!member) return "Ahli";
  return member.active ? member.name : `${member.name} (tidak aktif)`;
}

function collectionSummary(data: Snapshot, view: View, collectionId: string | null): Report {
  const collections = sortCollections(data.collections).filter((c) => !collectionId || c.id === collectionId);
  const charged: ChargeLedger[] = [];
  let voluntaryIn = 0;
  let voluntaryWait = 0;
  const rows = collections.map((c) => {
    const totals = view.collectionTotals(c.id);
    const base = {
      name: c.name,
      type: collectionTypeLabels[c.type],
      status: [collectionStatusLabels[c.status]],
      participants: totals.participants,
    };
    if (c.type === "voluntary") {
      const wait = voluntaryPending(data.payments, c.id);
      voluntaryIn += totals.voluntary;
      voluntaryWait += wait;
      return {
        key: c.id,
        values: { ...base, expected: null, received: totals.voluntary, dueNow: null, upcoming: null, pending: wait, paid: null, partial: null, unpaid: null, exempt: null, overdue: null },
      };
    }
    for (const charge of view.chargesByCollection.get(c.id) ?? []) charged.push(view.ledgers.get(charge.id)!);
    return {
      key: c.id,
      values: {
        ...base,
        expected: totals.expected,
        received: totals.received,
        dueNow: totals.dueNow,
        upcoming: totals.upcoming,
        pending: totals.pending,
        paid: totals.counts.paid,
        partial: totals.counts.partial,
        unpaid: totals.counts.unpaid,
        exempt: totals.counts.exempt,
        overdue: totals.counts.overdue,
      },
    };
  });
  const all = totalsOf(charged);
  return {
    title: "Ringkasan kutipan",
    scope: collectionId ? collections[0]?.name ?? "—" : "Semua kutipan",
    columns: [
      text("name", "Kutipan"),
      text("type", "Jenis"),
      status("status", "Status"),
      count("participants", "Peserta"),
      money("expected", "Dijangka"),
      money("received", "Diterima"),
      money("dueNow", "Tertunggak"),
      money("upcoming", "Akan datang"),
      money("pending", "Menunggu semakan"),
      low(count("paid", "Dibayar")),
      low(count("partial", "Sebahagian")),
      low(count("unpaid", "Belum bayar")),
      low(count("exempt", "Dikecualikan")),
      low(count("overdue", "Lewat")),
    ],
    rows,
    totals: {
      name: "Jumlah",
      type: null,
      status: null,
      participants: null,
      expected: all.expected,
      received: all.received + voluntaryIn,
      dueNow: all.dueNow,
      upcoming: all.upcoming,
      pending: all.pending + voluntaryWait,
      paid: all.counts.paid,
      partial: all.counts.partial,
      unpaid: all.counts.unpaid,
      exempt: all.counts.exempt,
      overdue: all.counts.overdue,
    },
    summary: [
      { label: "Dijangka", sen: all.expected },
      { label: "Diterima (disahkan)", sen: all.received + voluntaryIn },
      { label: "Tertunggak", sen: all.dueNow },
      { label: "Menunggu semakan", sen: all.pending + voluntaryWait },
    ],
    empty: "Tiada kutipan lagi.",
    footnote:
      "Bilangan status dikira bagi setiap caj: kutipan bulanan ada satu caj bagi setiap ahli setiap bulan. Diterima termasuk sumbangan sukarela yang disahkan. Menunggu semakan belum dikira sebagai diterima.",
  };
}

function memberSummary(data: Snapshot, view: View, collectionId: string | null): Report {
  const voluntary = data.collections.filter((c) => c.type === "voluntary");
  const scope: ChargeLedger[] = [];
  let contributionsTotal = 0;
  let voluntaryWaitTotal = 0;
  const rows = [...data.members]
    .sort((a, b) => a.name.localeCompare(b.name, "ms"))
    .flatMap((member) => {
      const ledgers = view.memberLedgers(member.id).filter((l) => !collectionId || l.charge.collectionId === collectionId);
      const contributions = collectionId ? 0 : sum(voluntary.map((c) => voluntaryReceived(data.payments, c.id, member.id)));
      const voluntaryWait = collectionId ? 0 : sum(voluntary.map((c) => voluntaryPending(data.payments, c.id, member.id)));
      if (!ledgers.length && !contributions && !voluntaryWait) return [];
      scope.push(...ledgers);
      contributionsTotal += contributions;
      voluntaryWaitTotal += voluntaryWait;
      const totals = totalsOf(ledgers);
      return [
        {
          key: member.id,
          values: {
            name: memberLabel(view, member.id),
            category: member.category ? categoryLabels[member.category] : null,
            expected: totals.expected,
            received: totals.received,
            dueNow: totals.dueNow,
            upcoming: totals.upcoming,
            pending: totals.pending + voluntaryWait,
            contributions: collectionId ? null : contributions,
          } as Record<string, Value>,
        },
      ];
    });
  const all = totalsOf(scope);
  const columns = [
    text("name", "Ahli"),
    low(text("category", "Kategori")),
    money("expected", "Dijangka"),
    money("received", "Diterima"),
    money("dueNow", "Baki semasa"),
    money("upcoming", "Akan datang"),
    money("pending", "Menunggu semakan"),
  ];
  if (!collectionId) columns.push(money("contributions", "Sumbangan sukarela"));
  return {
    title: "Ringkasan ahli",
    scope: collectionId ? view.collectionsById.get(collectionId)?.name ?? "—" : "Semua kutipan",
    columns,
    rows,
    totals: {
      name: "Jumlah",
      category: null,
      expected: all.expected,
      received: all.received,
      dueNow: all.dueNow,
      upcoming: all.upcoming,
      pending: all.pending + voluntaryWaitTotal,
      contributions: collectionId ? null : contributionsTotal,
    },
    summary: [
      { label: "Dijangka", sen: all.expected },
      { label: "Diterima (disahkan)", sen: all.received },
      { label: "Baki semasa", sen: all.dueNow },
      ...(collectionId ? [] : [{ label: "Sumbangan sukarela", sen: contributionsTotal }]),
    ],
    empty: "Tiada ahli dengan caj dalam skop ini.",
    footnote: "Baki semasa tidak termasuk bulan yang akan datang. Menunggu semakan belum dikira sebagai diterima.",
  };
}

function owingReport(data: Snapshot, view: View, collection: Collection, periodId: string | null): Report {
  const periods = new Map((view.periodsByCollection.get(collection.id) ?? []).map((p) => [p.id, p]));
  const scope = (view.chargesByCollection.get(collection.id) ?? [])
    .filter((charge) => !periodId || charge.periodId === periodId)
    .map((charge) => view.ledgers.get(charge.id)!)
    .filter((l) => !l.future);
  const owing = scope
    .filter((l) => (l.status === "unpaid" || l.status === "partial") && l.remaining > 0)
    .sort((a, b) => {
      const ma = a.charge.periodId ? periods.get(a.charge.periodId)?.month ?? "" : "";
      const mb = b.charge.periodId ? periods.get(b.charge.periodId)?.month ?? "" : "";
      return memberLabel(view, a.charge.memberId).localeCompare(memberLabel(view, b.charge.memberId), "ms") || ma.localeCompare(mb);
    });
  const monthly = collection.type === "monthly";
  const totals = totalsOf(owing);
  const period = periodId ? periods.get(periodId) : null;
  const columns = [text("name", "Ahli"), low(text("phone", "Telefon"))];
  if (monthly) columns.push(text("month", "Bulan"));
  columns.push(
    money("required", "Amaun"),
    money("confirmed", "Diterima"),
    money("remaining", "Baki"),
    money("pending", "Menunggu semakan"),
    status("status", "Status"),
    low(text("due", "Tarikh akhir")),
  );
  return {
    title: "Ahli belum bayar / sebahagian",
    scope: `${collection.name}${monthly ? ` · ${period ? formatMonth(period.month) : "Semua bulan setakat ini"}` : ""}`,
    columns,
    rows: owing.map((l) => {
      const chips: Chip[] = [cellStatusLabels[cellStatus(l)]];
      if (l.overdue) chips.push(overdueLabel);
      if (l.pending > 0) chips.push(pendingLabel);
      const p = l.charge.periodId ? periods.get(l.charge.periodId) : null;
      return {
        key: l.charge.id,
        values: {
          name: memberLabel(view, l.charge.memberId),
          phone: view.membersById.get(l.charge.memberId)?.phone ?? null,
          month: p ? formatMonth(p.month) : null,
          required: l.required,
          confirmed: l.confirmed,
          remaining: l.remaining,
          pending: l.pending,
          status: chips,
          due: l.charge.dueDate ? formatDay(l.charge.dueDate) : null,
        },
      };
    }),
    totals: {
      name: "Jumlah",
      phone: null,
      month: null,
      required: totals.expected,
      confirmed: totals.received,
      remaining: totals.dueNow,
      pending: totals.pending,
      status: null,
      due: null,
    },
    summary: [
      { label: "Baki tertunggak", sen: totals.dueNow },
      { label: "Menunggu semakan", sen: totals.pending },
    ],
    empty: "Semua ahli dalam skop ini sudah menjelaskan bayaran.",
    footnote: "Ahli yang dikecualikan, sudah membayar penuh atau bagi bulan yang akan datang tidak disenaraikan. Menunggu semakan belum dikira sebagai diterima.",
  };
}

function monthlyReport(view: View, collection: Collection): Report {
  const charges = view.chargesByCollection.get(collection.id) ?? [];
  const periods = view.periodsByCollection.get(collection.id) ?? [];
  const all = view.collectionTotals(collection.id);
  return {
    title: "Laporan bulanan",
    scope: collection.name,
    columns: [
      text("month", "Bulan"),
      low(text("due", "Tarikh akhir")),
      status("state", "Keadaan"),
      money("expected", "Dijangka"),
      money("received", "Diterima"),
      money("dueNow", "Tertunggak"),
      money("upcoming", "Akan datang"),
      money("pending", "Menunggu semakan"),
      low(count("paid", "Dibayar")),
      low(count("charged", "Ahli dikenakan")),
    ],
    rows: periods.map((period) => {
      const ledgers = charges.filter((c) => c.periodId === period.id).map((c) => view.ledgers.get(c.id)!);
      const t = totalsOf(ledgers);
      const future = ledgers.some((l) => l.future);
      return {
        key: period.id,
        values: {
          month: formatMonth(period.month),
          due: period.dueDate ? formatDay(period.dueDate) : null,
          state: future
            ? [cellStatusLabels.future]
            : t.counts.overdue > 0
              ? [overdueLabel]
              : t.dueNow === 0
                ? [cellStatusLabels.paid]
                : [["Dalam kutipan", "brand"]],
          expected: t.expected,
          received: t.received,
          dueNow: t.dueNow,
          upcoming: t.upcoming,
          pending: t.pending,
          paid: t.counts.paid,
          charged: ledgers.length - t.counts.exempt,
        },
      };
    }),
    totals: {
      month: "Jumlah",
      due: null,
      state: null,
      expected: all.expected,
      received: all.received,
      dueNow: all.dueNow,
      upcoming: all.upcoming,
      pending: all.pending,
      paid: all.counts.paid,
      charged: null,
    },
    summary: [
      { label: "Dijangka", sen: all.expected },
      { label: "Diterima (disahkan)", sen: all.received },
      { label: "Tertunggak", sen: all.dueNow },
      { label: "Akan datang", sen: all.upcoming },
    ],
    empty: "Kutipan ini tiada bulan.",
    footnote: "Bulan yang akan datang tidak dikira sebagai tertunggak. Dibayar ialah bilangan ahli yang menjelaskan penuh bagi bulan itu.",
  };
}

function historyReport(
  data: Snapshot,
  view: View,
  collectionId: string | null,
  from: string,
  to: string,
  state: PaymentState | typeof ALL,
): Report {
  const allocationsByPayment = new Map<string, Allocation[]>();
  for (const a of data.allocations) {
    const list = allocationsByPayment.get(a.paymentId);
    if (list) list.push(a);
    else allocationsByPayment.set(a.paymentId, [a]);
  }
  const periods = new Map(data.periods.map((p) => [p.id, p]));
  const describe = (payment: Payment) => {
    if (payment.collectionId) return { label: view.collectionsById.get(payment.collectionId)?.name ?? "—", amount: payment.amount, inScope: !collectionId || payment.collectionId === collectionId };
    const byCollection = new Map<string, { months: string[]; amount: Sen }>();
    for (const a of allocationsByPayment.get(payment.id) ?? []) {
      const charge = view.ledgers.get(a.chargeId)?.charge;
      if (!charge) continue;
      const entry = byCollection.get(charge.collectionId) ?? { months: [], amount: 0 };
      entry.amount += a.amount;
      const month = charge.periodId ? periods.get(charge.periodId)?.month : undefined;
      if (month) entry.months.push(month);
      byCollection.set(charge.collectionId, entry);
    }
    const parts = [...byCollection.entries()].filter(([id]) => !collectionId || id === collectionId);
    return {
      label: parts
        .map(([id, e]) => {
          const name = view.collectionsById.get(id)?.name ?? "—";
          return e.months.length ? `${name} (${e.months.sort().map((m) => formatMonth(m, false)).join(", ")})` : name;
        })
        .join("; "),
      // With a collection chosen, only the part of the payment that went to it counts.
      amount: collectionId ? sum(parts.map(([, e]) => e.amount)) : payment.amount,
      inScope: parts.length > 0,
    };
  };
  const rows = data.payments
    .filter((p) => p.paidOn >= from && p.paidOn <= to && (state === ALL || p.state === state))
    .map((p) => ({ payment: p, ...describe(p) }))
    .filter((r) => r.inScope)
    .sort((a, b) => b.payment.paidOn.localeCompare(a.payment.paidOn) || b.payment.createdAt.localeCompare(a.payment.createdAt));
  const byState = (s: PaymentState) => sum(rows.filter((r) => r.payment.state === s).map((r) => r.amount));
  const collectionName = collectionId ? view.collectionsById.get(collectionId)?.name ?? "—" : "Semua kutipan";
  return {
    title: "Sejarah bayaran",
    scope: `${collectionName} · ${formatDay(from)} hingga ${formatDay(to)}${state === ALL ? "" : ` · ${paymentStateLabels[state][0]}`}`,
    columns: [
      text("date", "Tarikh bayar"),
      text("member", "Ahli"),
      text("collection", "Kutipan"),
      money("amount", "Amaun"),
      low(text("method", "Kaedah")),
      low(text("reference", "Rujukan")),
      status("state", "Status"),
      text("note", "Catatan / sebab"),
    ],
    rows: rows.map((r) => ({
      key: r.payment.id,
      values: {
        date: formatDay(r.payment.paidOn),
        member: memberLabel(view, r.payment.memberId),
        collection: r.label || "—",
        amount: r.amount,
        method: methodLabels[r.payment.method],
        reference: r.payment.reference,
        state: [paymentStateLabels[r.payment.state]],
        note: r.payment.state === "reversed" ? `Dibatalkan: ${r.payment.reversalReason ?? "—"}` : r.payment.note,
      },
    })),
    // Confirmed, pending and reversed money are never added together.
    totals: null,
    summary: [
      { label: "Disahkan", sen: byState("confirmed") },
      { label: "Menunggu semakan", sen: byState("pending") },
      { label: "Dibatalkan", sen: byState("reversed") },
    ],
    empty: "Tiada bayaran dalam tempoh ini.",
    footnote: "Hanya bayaran yang disahkan dikira sebagai diterima. Bayaran yang dibatalkan kekal dalam rekod bersama sebabnya.",
  };
}

// Page ------------------------------------------------------------------------------------

export function ReportsPage() {
  const { data, view } = useSnapshot();
  const [kind, setKind] = useState<ReportKind>("kutipan");
  const [pick, setPick] = useState<string>(ALL);
  const [periodPick, setPeriodPick] = useState<string>(ALL);
  const [from, setFrom] = useState(() => `${todayDay().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(() => todayDay());
  const [stateFilter, setStateFilter] = useState<PaymentState | typeof ALL>(ALL);
  const [stamp, setStamp] = useState(() => new Date().toISOString());

  const sorted = useMemo(() => sortCollections(data.collections), [data.collections]);
  const collectionOptions = useMemo(() => {
    if (kind === "belum") return sorted.filter((c) => c.type !== "voluntary" && c.status !== "draft");
    if (kind === "bulanan") return sorted.filter((c) => c.type === "monthly");
    if (kind === "ahli") return sorted.filter((c) => c.type !== "voluntary");
    return sorted;
  }, [kind, sorted]);
  const allowAll = kind !== "belum" && kind !== "bulanan";
  const collection = collectionOptions.find((c) => c.id === pick) ?? (allowAll ? null : collectionOptions[0] ?? null);
  const thisMonth = view.today.slice(0, 7);
  const periodOptions =
    kind === "belum" && collection?.type === "monthly"
      ? (view.periodsByCollection.get(collection.id) ?? []).filter((p) => p.month <= thisMonth)
      : [];
  const period = periodOptions.find((p) => p.id === periodPick) ?? null;
  const rangeInvalid = kind === "sejarah" && (!from || !to || from > to);

  const report = useMemo<Report | null>(() => {
    switch (kind) {
      case "kutipan":
        return collectionSummary(data, view, collection?.id ?? null);
      case "ahli":
        return memberSummary(data, view, collection?.id ?? null);
      case "belum":
        return collection ? owingReport(data, view, collection, period?.id ?? null) : null;
      case "bulanan":
        return collection ? monthlyReport(view, collection) : null;
      case "sejarah":
        return rangeInvalid ? null : historyReport(data, view, collection?.id ?? null, from, to, stateFilter);
    }
  }, [kind, data, view, collection, period, from, to, stateFilter, rangeInvalid]);

  const headerFields = (at: string): [string, string][] => [
    ["Kelab", data.club.name],
    ["Sekolah", data.club.school ?? "—"],
    ["Sesi", data.club.session],
    ["Skop", report?.scope ?? "—"],
    ["Tarikh eksport", `${formatDateTime(at)} (waktu Malaysia)`],
    ["Nota", "Rekod kutipan, bukan penyata perakaunan."],
  ];

  const exportCsv = () => {
    if (!report) return;
    const at = new Date().toISOString();
    setStamp(at);
    const slug = REPORTS.find((r) => r.value === kind)!.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      download(`kelabkit-${slug}-${todayDay()}.csv`, buildCsv(report, headerFields(at)));
      toast.success("Fail CSV dimuat turun.");
    } catch {
      toast.error("Fail CSV tidak dapat dihasilkan. Cuba lagi.");
    }
  };

  const print = () => {
    flushSync(() => setStamp(new Date().toISOString()));
    window.print();
  };

  const missingCollection = (kind === "belum" || kind === "bulanan") && !collection;

  return (
    <PageShell className="print:max-w-none print:gap-3 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Laporan"
          description="Ringkasan kutipan dan bayaran untuk mesyuarat atau semakan. Angka sama seperti yang dipaparkan di skrin lain."
          actions={
            <>
              <Button variant="outline" onClick={exportCsv} disabled={!report}>
                <Download /> Muat turun CSV
              </Button>
              <Button onClick={print} disabled={!report}>
                <Printer /> Cetak / PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-3 print:hidden">
        <FilterPills<ReportKind>
          label="Jenis laporan"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPeriodPick(ALL);
          }}
          options={REPORTS}
        />
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="grid min-w-0 gap-1.5 sm:w-72">
            <Label htmlFor="rpt-collection">{kind === "bulanan" ? "Kutipan bulanan" : "Kutipan"}</Label>
            <Select
              value={collection?.id ?? ALL}
              onValueChange={(value) => {
                setPick(value);
                setPeriodPick(ALL);
              }}
              disabled={!allowAll && collectionOptions.length === 0}
            >
              <SelectTrigger id="rpt-collection" className="h-10 w-full rounded-xl bg-card">
                <SelectValue placeholder="Tiada kutipan yang sesuai" />
              </SelectTrigger>
              <SelectContent position="popper">
                {allowAll && <SelectItem value={ALL}>Semua kutipan</SelectItem>}
                {collectionOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {periodOptions.length > 0 && (
            <div className="grid min-w-0 gap-1.5 sm:w-56">
              <Label htmlFor="rpt-month">Bulan</Label>
              <Select value={period?.id ?? ALL} onValueChange={setPeriodPick}>
                <SelectTrigger id="rpt-month" className="h-10 w-full rounded-xl bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>Semua bulan setakat ini</SelectItem>
                  {periodOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatMonth(p.month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "sejarah" && (
            <>
              <div className="grid min-w-0 gap-1.5 sm:w-44">
                <Label htmlFor="rpt-from">Dari</Label>
                <Input id="rpt-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl bg-card" />
              </div>
              <div className="grid min-w-0 gap-1.5 sm:w-44">
                <Label htmlFor="rpt-to">Hingga</Label>
                <Input id="rpt-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl bg-card" />
              </div>
            </>
          )}
        </div>
        {kind === "sejarah" && (
          <FilterPills<PaymentState | typeof ALL>
            label="Status bayaran"
            value={stateFilter}
            onChange={setStateFilter}
            options={[
              { value: ALL, label: "Semua status" },
              { value: "confirmed", label: "Disahkan" },
              { value: "pending", label: "Menunggu semakan" },
              { value: "reversed", label: "Dibatalkan" },
            ]}
          />
        )}
        {rangeInvalid && <p className="text-xs font-medium text-st-unpaid">Pilih tarikh mula dan tarikh akhir; tarikh mula tidak boleh selepas tarikh akhir.</p>}
      </div>

      {missingCollection ? (
        <EmptyState
          icon={FileText}
          title={kind === "bulanan" ? "Tiada kutipan bulanan" : "Tiada kutipan wajib"}
          description={kind === "bulanan" ? "Laporan bulanan hanya untuk kutipan jenis bulanan." : "Laporan ini hanya untuk kutipan sekali bayar atau bulanan."}
        />
      ) : report ? (
        <ReportView report={report} header={headerFields(stamp)} />
      ) : null}
    </PageShell>
  );
}

function ReportView({ report, header }: { report: Report; header: [string, string][] }) {
  const [club, school, session, scope, exported, note] = header;
  return (
    <SectionCard className="print:rounded-none print:border-0 print:shadow-none" contentClassName="print:px-0">
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-primary-strong uppercase">{report.title}</p>
            <h2 className="mt-1 font-display text-lg font-bold break-words">{club[1]}</h2>
            <p className="text-xs text-muted-foreground">
              {school[1] !== "—" && `${school[1]} · `}Sesi {session[1]}
            </p>
          </div>
          <dl className="grid gap-0.5 text-xs sm:text-right">
            <div>
              <dt className="inline text-muted-foreground">Skop: </dt>
              <dd className="inline font-medium break-words">{scope[1]}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Tarikh eksport: </dt>
              <dd className="inline font-medium">{exported[1]}</dd>
            </div>
          </dl>
        </div>
        <p className="rounded-xl border border-dashed border-primary/40 bg-primary-tint/50 px-3 py-2 text-xs text-muted-foreground print:border-border print:bg-transparent">
          {note[1]}
        </p>

        {report.summary.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4 print:grid-cols-4">
            {report.summary.map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5">
                <dt className="text-[11.5px] text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 text-[15px] font-bold tabular-nums">{formatMoney(item.sen)}</dd>
              </div>
            ))}
          </dl>
        )}

        {report.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{report.empty}</p>
        ) : (
          <>
            <ReportCards report={report} />
            <ReportTable report={report} />
          </>
        )}
        {report.footnote && <p className="text-xs text-muted-foreground">{report.footnote}</p>}
      </div>
    </SectionCard>
  );
}

// Below the table's 72rem container width, `low` columns drop out on screen. Print shows them all.
const lowCol = (col: Col) => col.low && "hidden @6xl/report:table-cell print:table-cell";

/** Tablets and up, and print: the full table, scrolling sideways with a fade while more columns sit off to the right. */
function ReportTable({ report }: { report: Report }) {
  const frame = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const scroller = frame.current?.querySelector<HTMLElement>("[data-slot=table-container]");
    if (!scroller) return;
    const update = () => setMore(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [report]);
  return (
    <div
      ref={frame}
      data-report-table
      className="@container/report relative hidden min-w-0 overflow-hidden rounded-xl border border-border md:block print:block print:overflow-visible print:rounded-none [&_[data-slot=table-container]]:overscroll-x-contain [&_[data-slot=table-container]]:print:overflow-visible"
    >
      <Table className="text-[13px] print:text-[10px]">
        <TableHeader className="bg-primary-tint">
          <TableRow className="hover:bg-transparent">
            {report.columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "h-10 px-3 text-xs font-semibold whitespace-nowrap text-muted-foreground print:h-7 print:px-1.5",
                  col.kind !== "text" && col.kind !== "status" && "text-right",
                  lowCol(col),
                )}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.map((row) => (
            <TableRow key={row.key} className="break-inside-avoid hover:bg-primary-tint/40">
              {report.columns.map((col) => (
                <ValueCell key={col.key} col={col} value={row.values[col.key] ?? null} />
              ))}
            </TableRow>
          ))}
        </TableBody>
        {report.totals && (
          <TableFooter className="bg-primary-tint/60 font-semibold">
            <TableRow className="hover:bg-transparent">
              {report.columns.map((col) => (
                <ValueCell key={col.key} col={col} value={report.totals![col.key] ?? null} total />
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent transition-opacity print:hidden",
          more ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/** Phones: one card per row, every column as a label and value, then the totals card. Same report object as the table. */
function ReportCards({ report }: { report: Report }) {
  const [head, ...rest] = report.columns;
  const card = (key: string, values: Record<string, Value>, total?: boolean) => (
    <li key={key} className={cn("min-w-0 rounded-xl border border-border p-3", total ? "bg-primary-tint/60" : "bg-card")}>
      <p className="text-sm font-semibold break-words">{screenText(head, values[head.key] ?? null)}</p>
      <dl className="mt-2 grid grid-cols-1 gap-1 text-[13px]">
        {rest.map((col) => {
          const value = values[col.key] ?? null;
          if (total && value === null) return null;
          return (
            <div key={col.key} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="shrink-0 text-xs text-muted-foreground">{col.label}</dt>
              <dd className={cn("min-w-0 text-right break-words", (col.kind === "money" || col.kind === "count") && "tabular-nums", total && "font-semibold", value === null && "text-subtle")}>
                {col.kind === "status" && Array.isArray(value) && value.length > 0 ? (
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {value.map((chip) => (
                      <LabelChip key={chip[0]} entry={chip} compact />
                    ))}
                  </span>
                ) : (
                  screenText(col, value)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
  return (
    <ul className="grid grid-cols-1 gap-2 md:hidden print:hidden" aria-label={report.title}>
      {report.rows.map((row) => card(row.key, row.values))}
      {report.totals && card("totals", report.totals, true)}
    </ul>
  );
}

function ValueCell({ col, value, total }: { col: Col; value: Value; total?: boolean }) {
  const numeric = col.kind === "money" || col.kind === "count";
  return (
    <TableCell
      className={cn(
        "px-3 py-2.5 align-top print:px-1.5 print:py-1",
        numeric && "text-right whitespace-nowrap tabular-nums",
        col.kind === "text" && "min-w-28 max-w-64 break-words whitespace-normal",
        value === null && "text-subtle",
        lowCol(col),
      )}
    >
      {col.kind === "status" && Array.isArray(value) && value.length > 0 && !total ? (
        <span className="inline-flex flex-wrap gap-1">
          {value.map((chip) => (
            <LabelChip key={chip[0]} entry={chip} compact />
          ))}
        </span>
      ) : (
        screenText(col, value)
      )}
    </TableCell>
  );
}
