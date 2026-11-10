import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_SEN, parseRinggit, senToInput } from "@/lib/money/amount";
import { allocateInOrder, chargeLedger, indexLedger, totalsOf, voluntaryReceived } from "@/lib/money/ledger";
import { daysInMonth, dueDateFor, monthsBetween } from "@/lib/money/months";
import type { Allocation, Charge, CollectionPeriod, Payment } from "@/lib/types";

const TODAY = "2026-03-15";

function charge(id: string, amount: number, extra: Partial<Charge> = {}): Charge {
  return {
    id,
    collectionId: "c1",
    periodId: null,
    memberId: "m1",
    amount,
    exempt: false,
    exemptReason: null,
    dueDate: null,
    note: null,
    ...extra,
  };
}

function payment(id: string, amount: number, state: Payment["state"] = "confirmed", extra: Partial<Payment> = {}): Payment {
  return {
    id,
    idempotencyKey: id,
    memberId: "m1",
    collectionId: null,
    amount,
    method: "cash",
    paidOn: "2026-03-01",
    reference: null,
    note: null,
    state,
    createdAt: "2026-03-01T00:00:00Z",
    confirmedAt: null,
    reversedAt: null,
    reversalReason: null,
    ...extra,
  };
}

const alloc = (paymentId: string, chargeId: string, amount: number): Allocation => ({
  id: `${paymentId}-${chargeId}`,
  paymentId,
  chargeId,
  amount,
});

function ledgerFor(c: Charge, payments: Payment[], allocations: Allocation[], periods: CollectionPeriod[] = []) {
  return chargeLedger(c, indexLedger(payments, allocations, periods), TODAY);
}

describe("parseRinggit", () => {
  it("accepts common treasurer input", () => {
    expect(parseRinggit("10")).toEqual({ ok: true, sen: 1000 });
    expect(parseRinggit("10.5")).toEqual({ ok: true, sen: 1050 });
    expect(parseRinggit("RM 1,250.05")).toEqual({ ok: true, sen: 125005 });
    expect(parseRinggit(".50")).toEqual({ ok: true, sen: 50 });
    expect(parseRinggit("0")).toEqual({ ok: true, sen: 0 });
  });
  it("refuses invalid input instead of guessing", () => {
    expect(parseRinggit("")).toEqual({ ok: false, error: "AMOUNT_REQUIRED" });
    expect(parseRinggit("-5")).toEqual({ ok: false, error: "AMOUNT_NEGATIVE" });
    expect(parseRinggit("10.555")).toEqual({ ok: false, error: "AMOUNT_DECIMALS" });
    expect(parseRinggit("1o")).toEqual({ ok: false, error: "AMOUNT_INVALID" });
    expect(parseRinggit(".")).toEqual({ ok: false, error: "AMOUNT_INVALID" });
    expect(parseRinggit("100000.01")).toEqual({ ok: false, error: "AMOUNT_TOO_LARGE" });
    expect(parseRinggit("100000")).toEqual({ ok: true, sen: MAX_AMOUNT_SEN });
  });
  it("never drifts through floating point", () => {
    expect(parseRinggit("0.29")).toEqual({ ok: true, sen: 29 });
    expect(parseRinggit("1.15")).toEqual({ ok: true, sen: 115 });
    expect(senToInput(115)).toBe("1.15");
  });
});

describe("months", () => {
  it("handles February and short months", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2026-04", 31)).toBe("2026-04-30");
    expect(dueDateFor("2026-01", 31)).toBe("2026-01-31");
    expect(dueDateFor("2026-01", null)).toBeNull();
  });
  it("lists months across a year boundary and refuses a reversed range", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-12", "2026-01")).toEqual([]);
    expect(monthsBetween("2026-01", "2026-12")).toHaveLength(12);
  });
});

describe("chargeLedger", () => {
  it("walks unpaid → partial → paid across two separate payments", () => {
    const c = charge("ch1", 2500);
    expect(ledgerFor(c, [], []).status).toBe("unpaid");
    const p1 = payment("p1", 1000);
    const partial = ledgerFor(c, [p1], [alloc("p1", "ch1", 1000)]);
    expect(partial).toMatchObject({ status: "partial", confirmed: 1000, remaining: 1500 });
    const p2 = payment("p2", 1500, "confirmed", { paidOn: "2026-03-10" });
    const paid = ledgerFor(c, [p1, p2], [alloc("p1", "ch1", 1000), alloc("p2", "ch1", 1500)]);
    expect(paid).toMatchObject({ status: "paid", confirmed: 2500, remaining: 0, lastPaidOn: "2026-03-10" });
  });

  it("keeps pending money out of confirmed but blocks it from being paid twice", () => {
    const c = charge("ch1", 2500);
    const ledger = ledgerFor(c, [payment("p1", 1000, "pending")], [alloc("p1", "ch1", 1000)]);
    expect(ledger).toMatchObject({ status: "unpaid", confirmed: 0, pending: 1000, remaining: 2500, payable: 1500 });
  });

  it("ignores reversed payments", () => {
    const c = charge("ch1", 2500);
    const ledger = ledgerFor(c, [payment("p1", 2500, "reversed")], [alloc("p1", "ch1", 2500)]);
    expect(ledger).toMatchObject({ status: "unpaid", confirmed: 0, remaining: 2500 });
  });

  it("treats an exemption as zero payable, not as paid", () => {
    const ledger = ledgerFor(charge("ch1", 2500, { exempt: true }), [], []);
    expect(ledger).toMatchObject({ status: "exempt", required: 0, remaining: 0, overdue: false });
  });

  it("marks overdue only past the due date, keeping progress", () => {
    expect(ledgerFor(charge("ch1", 2500, { dueDate: "2026-03-14" }), [], []).overdue).toBe(true);
    expect(ledgerFor(charge("ch1", 2500, { dueDate: "2026-03-15" }), [], []).overdue).toBe(false);
    expect(ledgerFor(charge("ch1", 2500), [], []).overdue).toBe(false);
    const partial = ledgerFor(charge("ch1", 2500, { dueDate: "2026-01-01" }), [payment("p1", 500)], [alloc("p1", "ch1", 500)]);
    expect(partial).toMatchObject({ status: "partial", overdue: true });
  });

  it("never reports a future month as overdue", () => {
    const periods: CollectionPeriod[] = [{ id: "apr", collectionId: "c1", month: "2026-04", dueDate: "2026-04-05" }];
    const ledger = ledgerFor(charge("ch1", 1000, { periodId: "apr", dueDate: "2026-04-05" }), [], [], periods);
    expect(ledger).toMatchObject({ future: true, overdue: false });
  });
});

describe("totals", () => {
  it("matches the Jamuan example: 25 + 15 + 25 + exempt = RM65 expected", () => {
    const charges = [
      charge("aina", 2500),
      charge("farah", 1500),
      charge("siti", 2500),
      charge("nadia", 2500, { exempt: true }),
    ];
    const payments = [payment("p1", 2500), payment("p2", 1000)];
    const allocations = [alloc("p1", "aina", 2500), alloc("p2", "farah", 1000)];
    const index = indexLedger(payments, allocations, []);
    const totals = totalsOf(charges.map((c) => chargeLedger(c, index, TODAY)));
    expect(totals).toMatchObject({ expected: 6500, received: 3500, outstanding: 3000 });
    expect(totals.counts).toMatchObject({ paid: 1, partial: 1, unpaid: 1, exempt: 1 });
  });

  it("splits current outstanding from future months", () => {
    const periods: CollectionPeriod[] = [
      { id: "mar", collectionId: "c1", month: "2026-03", dueDate: null },
      { id: "apr", collectionId: "c1", month: "2026-04", dueDate: null },
    ];
    const index = indexLedger([], [], periods);
    const totals = totalsOf([
      chargeLedger(charge("a", 1000, { periodId: "mar" }), index, TODAY),
      chargeLedger(charge("b", 1000, { periodId: "apr" }), index, TODAY),
    ]);
    expect(totals).toMatchObject({ expected: 2000, outstanding: 2000, dueNow: 1000, upcoming: 1000 });
  });

  it("counts voluntary money without creating debt", () => {
    const payments = [
      payment("v1", 500, "confirmed", { collectionId: "vol" }),
      payment("v2", 2000, "pending", { collectionId: "vol" }),
      payment("v3", 1000, "confirmed", { collectionId: "vol", memberId: "m2" }),
    ];
    expect(voluntaryReceived(payments, "vol")).toBe(1500);
    expect(voluntaryReceived(payments, "vol", "m2")).toBe(1000);
  });
});

describe("allocateInOrder", () => {
  const ledgers = [
    { charge: charge("jan", 1000), payable: 1000 },
    { charge: charge("feb", 1000), payable: 400 },
    { charge: charge("mar", 1000), payable: 1000 },
  ];
  it("fills oldest first", () => {
    expect(allocateInOrder(1700, ledgers)).toEqual({
      ok: true,
      plan: [
        { chargeId: "jan", amount: 1000 },
        { chargeId: "feb", amount: 400 },
        { chargeId: "mar", amount: 300 },
      ],
    });
  });
  it("refuses an overpayment instead of silently crediting", () => {
    expect(allocateInOrder(2401, ledgers)).toEqual({ ok: false, error: "OVERPAYMENT", payable: 2400 });
  });
});
