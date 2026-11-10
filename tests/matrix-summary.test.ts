import { describe, expect, it } from "vitest";
import { summariseColumn } from "@/lib/matrix-summary";
import type { Allocation, Charge, Collection, CollectionPeriod, Member, Participant, Payment, Snapshot } from "@/lib/types";
import { buildView } from "@/lib/view";

// Today is 15 March 2026. Four members, three kinds of column.
const TODAY = "2026-03-15";

const member = (id: string): Member => ({ id, name: id, category: null, phone: null, notes: null, active: true, joinedOn: "2026-01-01", createdAt: "", updatedAt: "" });
const collection = (id: string, type: Collection["type"]): Collection => ({
  id, name: id, type, status: "active", defaultAmount: type === "voluntary" ? null : 5000, description: null, notes: null,
  dueDate: null, startMonth: null, endMonth: null, dueDay: null, icon: null, createdAt: "", updatedAt: "",
});
const charge = (id: string, memberId: string, collectionId: string, extra: Partial<Charge> = {}): Charge => ({
  id, collectionId, periodId: null, memberId, amount: 5000, exempt: false, exemptReason: null, dueDate: "2026-03-01", note: null, ...extra,
});
const payment = (id: string, memberId: string, amount: number, state: Payment["state"], collectionId: string | null = null): Payment => ({
  id, idempotencyKey: id, memberId, collectionId, amount, method: "cash", paidOn: "2026-03-02", reference: null, note: null,
  state, createdAt: "2026-03-02T00:00:00Z", confirmedAt: null, reversedAt: null, reversalReason: null,
});
const allocation = (paymentId: string, chargeId: string, amount: number): Allocation => ({ id: `${paymentId}-${chargeId}`, paymentId, chargeId, amount });

const periods: CollectionPeriod[] = [
  { id: "p-mar", collectionId: "monthly", month: "2026-03", dueDate: "2026-03-01" },
  { id: "p-apr", collectionId: "monthly", month: "2026-04", dueDate: "2026-04-01" },
];

function fixture() {
  const members = ["a", "b", "c", "d"].map(member);
  // One-off "trip" (RM50 each): a pays in full, b pays part, c has only a pending payment, d is exempt.
  // Monthly: March is due (a paid, b unpaid), April is a future month (nobody paid, except c in advance).
  const charges: Charge[] = [
    charge("t-a", "a", "trip"), charge("t-b", "b", "trip"), charge("t-c", "c", "trip"), charge("t-d", "d", "trip", { exempt: true, exemptReason: "x" }),
    charge("m-a", "a", "monthly", { periodId: "p-mar" }), charge("m-b", "b", "monthly", { periodId: "p-mar" }),
    charge("n-a", "a", "monthly", { periodId: "p-apr", dueDate: "2026-04-01" }), charge("n-b", "b", "monthly", { periodId: "p-apr", dueDate: "2026-04-01" }),
    charge("n-c", "c", "monthly", { periodId: "p-apr", dueDate: "2026-04-01" }),
  ];
  const payments: Payment[] = [
    payment("p1", "a", 5000, "confirmed"), payment("p2", "b", 2000, "confirmed"), payment("p3", "c", 5000, "pending"),
    payment("p4", "a", 5000, "confirmed"), payment("p5", "c", 1000, "confirmed"),
    payment("v1", "a", 3000, "confirmed", "gift"), payment("v2", "b", 9000, "pending", "gift"), payment("v3", "c", 700, "reversed", "gift"),
  ];
  const allocations = [allocation("p1", "t-a", 5000), allocation("p2", "t-b", 2000), allocation("p3", "t-c", 5000), allocation("p4", "m-a", 5000), allocation("p5", "n-c", 1000)];
  const participants: Participant[] = members.map((m) => ({ collectionId: "gift", memberId: m.id, amountOverride: null, exempt: false, note: null }));
  const snapshot = {
    club: {}, members, collections: [collection("trip", "one_off"), collection("monthly", "monthly"), collection("gift", "voluntary")],
    periods, participants, charges, payments, allocations, attachments: [], audit: [],
  } as unknown as Snapshot;
  const view = buildView(snapshot, TODAY);
  const column = (key: string) => view.columns(snapshot.collections).find((c) => c.key === key)!;
  const cells = (key: string) => members.map((m) => view.cell(m, column(key)));
  return { cells, trip: "trip|", march: "monthly|p-mar", april: "monthly|p-apr", gift: "gift|" };
}

describe("received", () => {
  it("counts confirmed money only; pending and exempt do not count", () => {
    const f = fixture();
    expect(summariseColumn("received", f.cells(f.trip))).toEqual({ kind: "received", received: 7000, expected: 15000, voluntary: false });
  });
  it("a voluntary column reports confirmed gifts only (pending and reversed excluded)", () => {
    const f = fixture();
    expect(summariseColumn("received", f.cells(f.gift))).toEqual({ kind: "received", received: 3000, expected: 0, voluntary: true });
  });
});

describe("overdue balance", () => {
  it("sums what is left on charges past their due date", () => {
    const f = fixture();
    // b owes 3000, c owes 5000 (pending is not received), a is paid, d is exempt.
    expect(summariseColumn("overdue", f.cells(f.trip))).toEqual({ kind: "overdue", amount: 8000, count: 2, applicable: true });
    expect(summariseColumn("overdue", f.cells(f.march))).toMatchObject({ amount: 5000, count: 1 });
  });
  it("a future month is never overdue", () => {
    const f = fixture();
    expect(summariseColumn("overdue", f.cells(f.april))).toMatchObject({ amount: 0, count: 0, applicable: true });
  });
  it("a voluntary column has no charges, so nothing is overdue and the figure does not apply", () => {
    const f = fixture();
    expect(summariseColumn("overdue", f.cells(f.gift))).toEqual({ kind: "overdue", amount: 0, count: 0, applicable: false });
  });
});

describe("percent settled", () => {
  it("is fully paid over charged members, leaving out exempt members", () => {
    const f = fixture();
    expect(summariseColumn("percent", f.cells(f.trip))).toEqual({ kind: "percent", percent: 33, settled: 1, total: 3 });
  });
  it("a pending payment does not settle a charge", () => {
    const f = fixture();
    const c = f.cells(f.trip)[2];
    expect(c.kind === "charge" && c.ledger.pending).toBe(5000);
    expect(summariseColumn("percent", [c])).toMatchObject({ percent: 0, settled: 0, total: 1 });
  });
  it("a future month with nothing paid has no ratio; an advance payment on it counts as part paid, not settled", () => {
    const f = fixture();
    // April: a, b unpaid (not counted), c paid RM10 in advance (counted, not settled).
    expect(summariseColumn("percent", f.cells(f.april))).toEqual({ kind: "percent", percent: 0, settled: 0, total: 1 });
    expect(summariseColumn("percent", f.cells(f.april).filter((cell) => cell.member.id !== "c"))).toEqual({ kind: "percent", percent: null, settled: 0, total: 0 });
  });
  it("a voluntary column has no ratio", () => {
    const f = fixture();
    expect(summariseColumn("percent", f.cells(f.gift))).toEqual({ kind: "percent", percent: null, settled: 0, total: 0 });
  });
});

describe("paid count", () => {
  it("counts members with confirmed money out of those charged", () => {
    const f = fixture();
    expect(summariseColumn("paidCount", f.cells(f.trip))).toEqual({ kind: "paidCount", paid: 2, total: 3 });
    expect(summariseColumn("paidCount", f.cells(f.march))).toEqual({ kind: "paidCount", paid: 1, total: 2 });
  });
  it("a future month counts only members who already paid", () => {
    const f = fixture();
    expect(summariseColumn("paidCount", f.cells(f.april))).toEqual({ kind: "paidCount", paid: 1, total: 1 });
  });
  it("a voluntary column counts givers with confirmed gifts and has no total", () => {
    const f = fixture();
    expect(summariseColumn("paidCount", f.cells(f.gift))).toEqual({ kind: "paidCount", paid: 1, total: null });
  });
});
