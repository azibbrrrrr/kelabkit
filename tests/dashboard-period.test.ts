import { describe, expect, it } from "vitest";
import { daysBetween, rankAttention } from "@/lib/money/attention";
import { chargeLedger, indexLedger, totalsOf, type ChargeLedger } from "@/lib/money/ledger";
import { chargeMonth, deltaOf, ledgersInMonth, parsePeriod, periodMonthsById, sessionMonths } from "@/lib/money/period";
import type { Allocation, Charge, CollectionPeriod, Member, Payment } from "@/lib/types";

const TODAY = "2026-11-11";

const periods: CollectionPeriod[] = ["2026-09", "2026-10", "2026-11", "2026-12"].map((month) => ({ id: `p-${month}`, collectionId: "c1", month, dueDate: `${month}-05` }));
const pm = periodMonthsById(periods);

function charge(id: string, memberId: string, month: string | null, amount = 5000, extra: Partial<Charge> = {}): Charge {
  return { id, collectionId: "c1", periodId: month ? `p-${month}` : null, memberId, amount, exempt: false, exemptReason: null, dueDate: month ? `${month}-05` : null, note: null, ...extra };
}
const member = (id: string, name: string): Member => ({ id, name, category: null, phone: null, notes: null, active: true, joinedOn: "2026-01-01", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
function payment(id: string, memberId: string, state: Payment["state"] = "confirmed"): Payment {
  return { id, idempotencyKey: id, memberId, collectionId: null, amount: 0, method: "cash", paidOn: "2026-11-01", reference: null, note: null, state, createdAt: "2026-11-01T00:00:00Z", confirmedAt: null, reversedAt: null, reversalReason: null };
}
const alloc = (paymentId: string, chargeId: string, amount: number): Allocation => ({ id: `${paymentId}-${chargeId}`, paymentId, chargeId, amount });

function ledgersFor(charges: Charge[], payments: Payment[] = [], allocations: Allocation[] = []) {
  const index = indexLedger(payments, allocations, periods);
  return charges.map((c) => chargeLedger(c, index, TODAY));
}

describe("deltaOf", () => {
  it("rises and falls with a percentage of the previous value", () => {
    expect(deltaOf(11000, 10000)).toEqual({ direction: "up", diff: 1000, percent: 10 });
    expect(deltaOf(7500, 10000)).toEqual({ direction: "down", diff: -2500, percent: 25 });
  });
  it("rounds the percentage to one decimal", () => {
    expect(deltaOf(40001, 30000).percent).toBe(33.3);
  });
  it("has no percentage on a zero base, only the amount", () => {
    expect(deltaOf(2000, 0)).toEqual({ direction: "up", diff: 2000, percent: null });
  });
  it("is flat when equal, including 0 against 0", () => {
    expect(deltaOf(5000, 5000)).toEqual({ direction: "flat", diff: 0, percent: 0 });
    expect(deltaOf(0, 0)).toEqual({ direction: "flat", diff: 0, percent: null });
  });
  it("handles a negative base by magnitude", () => {
    expect(deltaOf(-500, -1000)).toEqual({ direction: "up", diff: 500, percent: 50 });
  });
  it("goes down to zero as 100% down", () => {
    expect(deltaOf(0, 4000)).toEqual({ direction: "down", diff: -4000, percent: 100 });
  });
});

describe("month lens", () => {
  const charges = [charge("a", "m1", "2026-10"), charge("b", "m1", "2026-11"), charge("c", "m1", "2026-12"), charge("d", "m2", null, 3000, { dueDate: "2026-11-20" }), charge("e", "m2", null, 3000)];

  it("assigns a charge to its period month, else its due month, else none", () => {
    expect(chargeMonth(charges[0], pm)).toBe("2026-10");
    expect(chargeMonth(charges[3], pm)).toBe("2026-11");
    expect(chargeMonth(charges[4], pm)).toBeNull();
  });
  it("lists session months ascending without duplicates", () => {
    expect(sessionMonths(charges, pm)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
  it("accepts only a month that is in the session", () => {
    const months = ["2026-10", "2026-11"];
    expect(parsePeriod("2026-11", months)).toBe("2026-11");
    expect(parsePeriod("2026-01", months)).toBeNull();
    expect(parsePeriod("garbage", months)).toBeNull();
    expect(parsePeriod(null, months)).toBeNull();
  });
  it("sums a month's charges and only confirmed allocations count as received", () => {
    const ledgers = ledgersFor(charges, [payment("p1", "m1"), payment("p2", "m1", "pending")], [alloc("p1", "b", 2000), alloc("p2", "b", 3000)]);
    const nov = totalsOf(ledgersInMonth(ledgers, "2026-11", pm));
    expect(nov.expected).toBe(8000);
    expect(nov.received).toBe(2000);
    expect(nov.pending).toBe(3000);
    expect(nov.dueNow).toBe(6000);
  });
  it("treats a future month as upcoming, never overdue or due now", () => {
    const dec = totalsOf(ledgersInMonth(ledgersFor(charges), "2026-12", pm));
    expect(dec.expected).toBe(5000);
    expect(dec.upcoming).toBe(5000);
    expect(dec.dueNow).toBe(0);
    expect(dec.counts.overdue).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts calendar days across month and leap boundaries", () => {
    expect(daysBetween("2026-10-31", "2026-11-11")).toBe(11);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-11-11", "2026-11-11")).toBe(0);
  });
});

describe("rankAttention", () => {
  const members = [member("m1", "Zainab"), member("m2", "Aminah"), member("m3", "Bakar"), member("m4", "Cahaya"), member("m5", "Dolah")];
  const run = (charges: Charge[], payments: Payment[] = [], allocations: Allocation[] = []) => {
    const ledgers = ledgersFor(charges, payments, allocations);
    return rankAttention(members, (id) => ledgers.filter((l: ChargeLedger) => l.charge.memberId === id), TODAY);
  };

  it("orders by overdue amount, then oldest due date, then name", () => {
    const rows = run([
      charge("1", "m1", "2026-10", 9000), // Zainab 90, due 10-05
      charge("2", "m2", "2026-10", 5000), // Aminah 50, due 10-05
      charge("3", "m3", "2026-09", 5000), // Bakar 50, due 09-05 (older)
      charge("4", "m4", "2026-10", 5000), // Cahaya 50, due 10-05, name after Aminah
    ]);
    expect(rows.map((r) => r.member.name)).toEqual(["Zainab", "Bakar", "Aminah", "Cahaya"]);
  });
  it("sums a member's overdue charges and reports the oldest one's age", () => {
    const [row] = run([charge("1", "m1", "2026-09", 5000), charge("2", "m1", "2026-10", 5000)]);
    expect(row.overdue).toBe(10000);
    expect(row.oldestDue).toBe("2026-09-05");
    expect(row.daysOverdue).toBe(67);
  });
  it("leaves out future months, charges not yet due, exempt, and settled members", () => {
    const rows = run(
      [charge("1", "m1", "2026-12"), charge("2", "m2", "2026-11", 5000, { dueDate: "2026-11-20" }), charge("3", "m3", "2026-10", 5000, { exempt: true }), charge("4", "m4", "2026-10")],
      [payment("p1", "m4")],
      [alloc("p1", "4", 5000)],
    );
    expect(rows).toEqual([]);
  });
  it("does not let pending money reduce the amount owed", () => {
    const [row] = run([charge("1", "m1", "2026-10", 5000)], [payment("p1", "m1", "pending")], [alloc("p1", "1", 5000)]);
    expect(row.overdue).toBe(5000);
  });
  it("counts only what is still unpaid after a part payment", () => {
    const [row] = run([charge("1", "m1", "2026-10", 5000)], [payment("p1", "m1")], [alloc("p1", "1", 2000)]);
    expect(row.overdue).toBe(3000);
  });
});
