import { describe, expect, it } from "vitest";
import { formatMoneyShort } from "@/lib/format";
import { buildPaymentList, buildSheet, currentColumnIndex, DEFAULT_SHEET_OPTIONS, type SheetTexts } from "@/lib/payment-list";
import { buildXlsxRows, RM_FORMAT, type XlsxColors } from "@/lib/payment-list-xlsx";
import type { Allocation, Charge, Collection, CollectionPeriod, Member, Payment, Snapshot } from "@/lib/types";
import { buildView } from "@/lib/view";

// Today is 15 March 2026. A monthly collection "yuran" of RM10 a month, January to June.
const TODAY = "2026-03-15";
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

const member = (id: string, extra: Partial<Member> = {}): Member => ({
  id, name: `Cikgu ${id}`, category: "guru", phone: `012-${id}-PHONE`, notes: `NOTE-${id}`, active: true, joinedOn: "2026-01-01", createdAt: "", updatedAt: "", ...extra,
});
const collection = (id: string, type: Collection["type"]): Collection => ({
  id, name: id, type, status: "active", defaultAmount: 1000, description: null, notes: null,
  dueDate: null, startMonth: null, endMonth: null, dueDay: null, icon: null, createdAt: "", updatedAt: "",
});
const periods: CollectionPeriod[] = MONTHS.map((month) => ({ id: `p-${month}`, collectionId: "yuran", month, dueDate: `${month}-01` }));
const charge = (memberId: string, month: string, extra: Partial<Charge> = {}): Charge => ({
  id: `c-${memberId}-${month}`, collectionId: "yuran", periodId: `p-${month}`, memberId, amount: 1000, exempt: false, exemptReason: null, dueDate: `${month}-01`, note: null, ...extra,
});
const payment = (id: string, memberId: string, amount: number, paidOn: string, state: Payment["state"] = "confirmed"): Payment => ({
  id, idempotencyKey: id, memberId, collectionId: null, amount, method: "cash", paidOn, reference: `REF-${id}`, note: `PNOTE-${id}`,
  state, createdAt: `${paidOn}T00:00:00Z`, confirmedAt: null, reversedAt: null, reversalReason: state === "reversed" ? "REASON" : null,
});
const alloc = (paymentId: string, memberId: string, month: string, amount: number): Allocation => ({
  id: `${paymentId}-${month}`, paymentId, chargeId: `c-${memberId}-${month}`, amount,
});

function fixture() {
  const members = [
    member("lump"), member("several"), member("partial"), member("pending"), member("reversed"), member("exempt"), member("prepaid"),
    member("staff", { category: "kakitangan" }), member("outsider"),
  ];
  const withCharges = (id: string, months = MONTHS) => months.map((m) => charge(id, m));
  const charges: Charge[] = [
    ...["lump", "several", "partial", "pending", "reversed", "prepaid", "staff"].flatMap((id) => withCharges(id)),
    ...MONTHS.map((m) => charge("exempt", m, { exempt: true, exemptReason: "SECRET-REASON" })),
    { ...charge("several", "2026-01"), id: "trip-several", collectionId: "trip", periodId: null },
  ];
  const payments: Payment[] = [
    payment("lump", "lump", 3000, "2026-02-10"),
    payment("s1", "several", 600, "2026-01-05"),
    payment("s2", "several", 400, "2026-01-20"),
    payment("part", "partial", 400, "2026-01-08"),
    payment("pend", "pending", 1000, "2026-01-09", "pending"),
    payment("rev", "reversed", 1000, "2026-01-09", "reversed"),
    payment("pre", "prepaid", 1000, "2026-03-01"),
    payment("trip", "several", 5000, "2026-02-01"),
    { ...payment("gift", "several", 700, "2026-02-02"), collectionId: "gift" },
  ];
  const allocations: Allocation[] = [
    alloc("lump", "lump", "2026-01", 1000), alloc("lump", "lump", "2026-02", 1000), alloc("lump", "lump", "2026-03", 1000),
    alloc("s1", "several", "2026-01", 600), alloc("s2", "several", "2026-01", 400),
    alloc("part", "partial", "2026-01", 400),
    alloc("pend", "pending", "2026-01", 1000),
    alloc("rev", "reversed", "2026-01", 1000),
    alloc("pre", "prepaid", "2026-06", 1000),
    { id: "trip-a", paymentId: "trip", chargeId: "trip-several", amount: 5000 },
  ];
  const snapshot = {
    club: {}, members, collections: [collection("yuran", "monthly"), collection("trip", "one_off")],
    periods, participants: [], charges, payments, allocations, attachments: [], audit: [],
  } as unknown as Snapshot;
  const view = buildView(snapshot, TODAY);
  const list = buildPaymentList(view, view.collectionsById.get("yuran")!, TODAY);
  const row = (id: string) => list.rows.find((r) => r.memberId === id)!;
  return { view, list, row, snapshot };
}

describe("payment list cells", () => {
  it("repeats a lump payment's date across the months it covers", () => {
    const { row } = fixture();
    expect(row("lump").cells.slice(0, 3)).toEqual([
      { kind: "paid", date: "2026-02-10" },
      { kind: "paid", date: "2026-02-10" },
      { kind: "paid", date: "2026-02-10" },
    ]);
  });
  it("shows the latest date among the payments that finished a charge", () => {
    expect(fixture().row("several").cells[0]).toEqual({ kind: "paid", date: "2026-01-20" });
  });
  it("marks some confirmed money without full cover as partial", () => {
    expect(fixture().row("partial").cells[0]).toEqual({ kind: "partial" });
  });
  it("never counts a pending payment", () => {
    const { row } = fixture();
    expect(row("pending").cells[0]).toEqual({ kind: "blank" });
    expect(row("pending").total).toBe(0);
  });
  it("never counts a reversed payment", () => {
    const { row } = fixture();
    expect(row("reversed").cells[0]).toEqual({ kind: "blank" });
    expect(row("reversed").total).toBe(0);
  });
  it("marks an exempt charge as exempt, and an exempt-only member has no total", () => {
    const { row } = fixture();
    expect(row("exempt").cells.every((c) => c.kind === "exempt")).toBe(true);
    expect(row("exempt").total).toBeNull();
  });
  it("shows a prepaid future month as paid and an unpaid future month as blank", () => {
    const { list, row } = fixture();
    expect(list.columns.map((c) => c.future)).toEqual([false, false, false, true, true, true]);
    expect(row("prepaid").cells[5]).toEqual({ kind: "paid", date: "2026-03-01" });
    expect(row("prepaid").cells[4]).toEqual({ kind: "blank" });
    expect(row("lump").cells[5]).toEqual({ kind: "blank" });
  });
  it("totals only confirmed money allocated to this collection", () => {
    const { row } = fixture();
    // several also paid RM50 to a one-off and RM7 as a voluntary gift: neither is in this list.
    expect(row("several").total).toBe(1000);
    expect(row("lump").total).toBe(3000);
    expect(row("partial").total).toBe(400);
    expect(row("prepaid").total).toBe(1000);
  });
  it("owes every unpaid month as Baki, future months included", () => {
    const { row } = fixture();
    // Six months of RM10 each. Baki is the whole collection, not only what is due by today.
    expect(row("lump").balance).toBe(3000);
    expect(row("several").balance).toBe(5000);
    expect(row("partial").balance).toBe(5600);
    expect(row("prepaid").balance).toBe(5000);
  });
  it("keeps pending and reversed money in Baki", () => {
    const { row } = fixture();
    expect(row("pending").balance).toBe(6000);
    expect(row("reversed").balance).toBe(6000);
  });
  it("has no Baki for an exempt-only member", () => {
    expect(fixture().row("exempt").balance).toBeNull();
  });
  it("lists only members who have a charge in the collection", () => {
    expect(fixture().list.rows.map((r) => r.memberId)).not.toContain("outsider");
  });
});

describe("period fallback for Bulan ini", () => {
  const cols = (months: string[]) => months.map((month) => ({ periodId: month, month, future: false }));
  it("uses today's month when it has a period", () => {
    expect(currentColumnIndex(cols(MONTHS), TODAY)).toBe(2);
  });
  it("uses the nearest earlier period when today's month has none", () => {
    expect(currentColumnIndex(cols(["2026-01", "2026-02", "2026-05"]), TODAY)).toBe(1);
  });
  it("uses the first period when all are in the future", () => {
    expect(currentColumnIndex(cols(["2026-05", "2026-06"]), TODAY)).toBe(0);
  });
  it("has no column when the collection has no periods", () => {
    expect(currentColumnIndex([], TODAY)).toBe(-1);
  });
});

const texts: SheetTexts = {
  title: (month) => (month ? `yuran · ${month}` : "yuran"),
  asOf: "Setakat 15 Mac 2026",
  nameHeader: "Nama",
  totalHeader: "Jumlah",
  balanceHeader: "Baki",
  partial: "Separa",
  exempt: "Kecuali",
  tick: "✓",
  group: (category) => (category ?? "none").toUpperCase(),
  legend: { paid: "Tarikh bayar", blank: "Belum direkodkan", partial: "Bayar sebahagian", exempt: "Dikecualikan" },
};

describe("payment list sheet", () => {
  it("groups by category in order with subheaders when more than one group exists", () => {
    const { list } = fixture();
    const sheet = buildSheet(list, DEFAULT_SHEET_OPTIONS, TODAY, texts, formatMoneyShort);
    expect(sheet.groups.map((g) => g.label)).toEqual(["GURU", "KAKITANGAN"]);
    expect(sheet.groups[0].rows.map((r) => r.name)).toEqual([...sheet.groups[0].rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b, "ms")));
  });
  it("has no subheader when there is one group", () => {
    const { view } = fixture();
    const only = buildPaymentList(view, view.collectionsById.get("yuran")!, TODAY);
    only.rows = only.rows.filter((r) => r.category === "guru");
    expect(buildSheet(only, DEFAULT_SHEET_OPTIONS, TODAY, texts, formatMoneyShort).groups.map((g) => g.label)).toEqual([null]);
  });
  it("renders dates, ticks, labels and the month view", () => {
    const { list } = fixture();
    const date = buildSheet(list, DEFAULT_SHEET_OPTIONS, TODAY, texts, formatMoneyShort);
    const find = (sheet: typeof date, name: string) => sheet.groups.flatMap((g) => g.rows).find((r) => r.name === name)!;
    expect(find(date, "Cikgu lump").cells[0].text).toBe("10 Feb");
    expect(find(date, "Cikgu partial").cells[0].text).toBe("Separa");
    expect(find(date, "Cikgu exempt").cells[0].text).toBe("Kecuali");
    expect(date.amountColumns).toEqual([{ kind: "paid", header: "Jumlah" }, { kind: "balance", header: "Baki" }]);
    expect(find(date, "Cikgu exempt").amounts).toEqual([{ text: null, sen: null }, { text: null, sen: null }]);
    expect(find(date, "Cikgu lump").amounts).toEqual([{ text: "RM30", sen: 3000 }, { text: "RM30", sen: 3000 }]);
    const tick = buildSheet(list, { ...DEFAULT_SHEET_OPTIONS, cell: "tick", span: "month", amounts: "none" }, TODAY, texts, formatMoneyShort);
    expect(tick.columns).toEqual([{ label: "MAC", future: false }]);
    expect(tick.title).toBe("yuran · Mac 2026");
    expect(tick.amountColumns).toEqual([]);
    expect(find(tick, "Cikgu lump").amounts).toEqual([]);
    expect(find(tick, "Cikgu lump").cells.map((c) => c.text)).toEqual(["✓"]);
  });
  it("shows only Baki when the treasurer picks it, still over the whole collection in the month view", () => {
    const { list } = fixture();
    const sheet = buildSheet(list, { ...DEFAULT_SHEET_OPTIONS, span: "month", amounts: "balance" }, TODAY, texts, formatMoneyShort);
    const partial = sheet.groups.flatMap((g) => g.rows).find((r) => r.name === "Cikgu partial")!;
    expect(sheet.amountColumns).toEqual([{ kind: "balance", header: "Baki" }]);
    expect(partial.amounts).toEqual([{ text: "RM56", sen: 5600 }]);
  });
  it("carries no phone, note, reference or exemption reason", () => {
    const { list } = fixture();
    const sheet = buildSheet(list, DEFAULT_SHEET_OPTIONS, TODAY, texts, formatMoneyShort);
    const out = JSON.stringify([list, sheet]);
    for (const secret of ["PHONE", "NOTE-", "PNOTE", "REF-", "SECRET-REASON", "REASON", "phone", "notes", "reference"]) expect(out).not.toContain(secret);
  });
});

const colors: XlsxColors = {
  headerFill: "#d13f6e", headerText: "#ffffff", futureFill: "#fce4ec", futureText: "#c2185b", groupFill: "#f9eef2", groupText: "#5f6672",
  paid: { fill: "#dcfce7", text: "#15803d" }, partial: { fill: "#fef3c7", text: "#b45309" }, exempt: { fill: "#ede9fe", text: "#6d28d9" }, muted: "#5f6672",
};

describe("xlsx rows", () => {
  const { list } = fixture();
  const sheet = buildSheet(list, DEFAULT_SHEET_OPTIONS, TODAY, texts, formatMoneyShort);
  const built = buildXlsxRows(sheet, colors);
  const cell = (r: number, c: number) => built.data[r][c] as Record<string, unknown>;
  it("starts with title, as-of and header, which stay frozen", () => {
    expect(cell(0, 0).value).toBe("yuran");
    expect(cell(1, 0).value).toBe("Setakat 15 Mac 2026");
    expect(cell(2, 0).value).toBe("Nama");
    expect(cell(2, 7).value).toBe("Jumlah");
    expect(cell(2, 8).value).toBe("Baki");
    expect(built.stickyRowsCount).toBe(3);
    expect(built.columns).toHaveLength(9);
  });
  it("writes group rows and one row per member", () => {
    expect(built.data).toHaveLength(3 + 2 + 8);
    expect(cell(3, 0).value).toBe("GURU");
  });
  it("colours paid, partial and exempt cells and leaves blanks unfilled", () => {
    const lump = built.data.findIndex((r) => (r[0] as Record<string, unknown>)?.value === "Cikgu lump");
    expect(cell(lump, 1)).toMatchObject({ value: "10 Feb", backgroundColor: "#dcfce7", textColor: "#15803d" });
    expect(cell(lump, 6)).toEqual({ value: null });
    const partial = built.data.findIndex((r) => (r[0] as Record<string, unknown>)?.value === "Cikgu partial");
    expect(cell(partial, 1)).toMatchObject({ value: "Separa", backgroundColor: "#fef3c7" });
    const exempt = built.data.findIndex((r) => (r[0] as Record<string, unknown>)?.value === "Cikgu exempt");
    expect(cell(exempt, 1)).toMatchObject({ value: "Kecuali", backgroundColor: "#ede9fe" });
  });
  it("writes Jumlah and Baki as numbers in ringgit from integer sen, and a dash when exempt only", () => {
    const partial = built.data.findIndex((r) => (r[0] as Record<string, unknown>)?.value === "Cikgu partial");
    expect(cell(partial, 7)).toMatchObject({ value: 4, format: RM_FORMAT, type: Number });
    expect(cell(partial, 8)).toMatchObject({ value: 56, format: RM_FORMAT, type: Number });
    const exempt = built.data.findIndex((r) => (r[0] as Record<string, unknown>)?.value === "Cikgu exempt");
    expect(cell(exempt, 7).value).toBe("—");
    expect(cell(exempt, 8).value).toBe("—");
  });
  it("drops the money columns that are not picked", () => {
    const only = (amounts: "paid" | "balance" | "none") =>
      buildXlsxRows(buildSheet(list, { ...DEFAULT_SHEET_OPTIONS, amounts }, TODAY, texts, formatMoneyShort), colors);
    expect(only("none").columns).toHaveLength(7);
    expect(only("balance").columns).toHaveLength(8);
    expect((only("balance").data[2][7] as Record<string, unknown>).value).toBe("Baki");
    expect((only("paid").data[2][7] as Record<string, unknown>).value).toBe("Jumlah");
  });
});
