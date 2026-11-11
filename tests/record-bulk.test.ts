import { describe, expect, it } from "vitest";
import { bulkTargets, planBulk } from "@/lib/record-bulk";
import type { Allocation, Charge, Collection, CollectionPeriod, Member, Payment, Snapshot } from "@/lib/types";
import { buildView } from "@/lib/view";

const TODAY = "2026-03-15";
const member = (id: string, active = true): Member => ({ id, name: id, category: null, phone: null, notes: null, active, joinedOn: "2026-01-01", createdAt: "", updatedAt: "" });
const collection = (id: string, type: Collection["type"], status: Collection["status"] = "active"): Collection => ({
  id, name: id, type, status, defaultAmount: 5000, description: null, notes: null, dueDate: null, startMonth: null, endMonth: null, dueDay: null, icon: null, createdAt: id, updatedAt: "",
});
const charge = (id: string, memberId: string, collectionId: string, extra: Partial<Charge> = {}): Charge => ({
  id, collectionId, periodId: null, memberId, amount: 5000, exempt: false, exemptReason: null, dueDate: "2026-03-01", note: null, ...extra,
});
const payment = (id: string, memberId: string, amount: number, state: Payment["state"]): Payment => ({
  id, idempotencyKey: id, memberId, collectionId: null, amount, method: "cash", paidOn: "2026-03-02", reference: null, note: null,
  state, createdAt: "", confirmedAt: null, reversedAt: null, reversalReason: null,
});
const alloc = (paymentId: string, chargeId: string, amount: number): Allocation => ({ id: `${paymentId}${chargeId}`, paymentId, chargeId, amount });
const periods: CollectionPeriod[] = [
  { id: "p-mar", collectionId: "monthly", month: "2026-03", dueDate: "2026-03-01" },
  { id: "p-apr", collectionId: "monthly", month: "2026-04", dueDate: "2026-04-01" },
];

function fixture() {
  const members = [member("a"), member("b"), member("c"), member("d"), member("z", false)];
  const snapshot = {
    club: {}, members, periods, participants: [], attachments: [], audit: [],
    collections: [collection("trip", "one_off"), collection("monthly", "monthly"), collection("gift", "voluntary"), collection("old", "one_off", "archived")],
    charges: [
      charge("t-a", "a", "trip"), charge("t-b", "b", "trip"), charge("t-c", "c", "trip"), charge("t-d", "d", "trip", { exempt: true, exemptReason: "x" }), charge("t-z", "z", "trip"),
      charge("m-a", "a", "monthly", { periodId: "p-mar" }), charge("n-a", "a", "monthly", { periodId: "p-apr", dueDate: "2026-04-01" }),
      charge("o-a", "a", "old"),
    ],
    // a: trip paid in full. b: RM20 confirmed. c: RM50 pending (awaiting review).
    payments: [payment("p1", "a", 5000, "confirmed"), payment("p2", "b", 2000, "confirmed"), payment("p3", "c", 5000, "pending")],
    allocations: [alloc("p1", "t-a", 5000), alloc("p2", "t-b", 2000), alloc("p3", "t-c", 5000)],
  } as unknown as Snapshot;
  return { snapshot, view: buildView(snapshot, TODAY) };
}
const messages = { exceeds: (p: number) => `max ${p}`, zero: "zero" };

describe("bulkTargets", () => {
  it("lists due charges only: no future month, no archived or voluntary collection, no exempt member", () => {
    const { snapshot, view } = fixture();
    const targets = bulkTargets(snapshot, view);
    expect(targets.map((target) => target.key).sort()).toEqual(["monthly|p-mar", "trip|"]);
    expect(targets.find((target) => target.key === "trip|")!.rows.map((row) => row.member.id)).toEqual(["b", "z"]); // active first; a is paid, c is pending, d exempt
  });
  it("offers b's remaining balance, and keeps a pending-covered member out while counting them", () => {
    const { snapshot, view } = fixture();
    const trip = bulkTargets(snapshot, view).find((target) => target.key === "trip|")!;
    expect(trip.rows.find((row) => row.member.id === "b")).toMatchObject({ payable: 3000, remaining: 3000 });
    expect(trip.rows.some((row) => row.member.id === "c")).toBe(false);
    expect(trip.awaitingReview).toBe(1);
  });
});

describe("planBulk", () => {
  it("a blank amount pays the payable balance in full; a typed amount is a part payment", () => {
    const { snapshot, view } = fixture();
    const rows = bulkTargets(snapshot, view).find((target) => target.key === "trip|")!.rows;
    const plan = planBulk(rows, new Set(["b", "z"]), { z: "10" }, messages);
    expect(plan.errors).toEqual({});
    expect(plan.lines).toEqual([
      { memberId: "b", chargeId: "t-b", amount: 3000 },
      { memberId: "z", chargeId: "t-z", amount: 1000 },
    ]);
    expect(plan.total).toBe(4000);
  });
  it("refuses an amount above what is payable, zero, and unparsable input, per member", () => {
    const { snapshot, view } = fixture();
    const rows = bulkTargets(snapshot, view).find((target) => target.key === "trip|")!.rows;
    const plan = planBulk(rows, new Set(["b", "z"]), { b: "30.01", z: "0" }, messages);
    expect(plan.errors).toEqual({ b: "max 3000", z: "zero" });
    expect(plan.lines).toEqual([]);
    expect(planBulk(rows, new Set(["b"]), { b: "abc" }, messages).errors.b).toBeTruthy();
  });
  it("members that are not ticked produce nothing", () => {
    const { snapshot, view } = fixture();
    const rows = bulkTargets(snapshot, view).find((target) => target.key === "trip|")!.rows;
    expect(planBulk(rows, new Set(), { b: "1" }, messages)).toEqual({ lines: [], errors: {}, total: 0 });
  });
});
