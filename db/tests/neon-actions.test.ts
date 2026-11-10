// The neon backend end to end, minus Google: neonBackend -> server actions -> service ->
// withClub -> Postgres (dev branch). Only the session lookup is replaced, with a seeded user
// id; everything else is the production path. Clubs are named "kk-test-*" and deleted after.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { KelabError } from "@/lib/errors";
import { today } from "@/lib/format";
import { chargeLedger, indexLedger } from "@/lib/money/ledger";
import { buildView } from "@/lib/view";
import { createPool } from "../client";

type Current = { userId: string; clubId: string | null; name: string } | null;
const state = vi.hoisted(() => ({ current: null as Current }));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined, get: () => undefined }) }));
vi.mock("@/lib/server/session", async () => {
  const { KelabError } = await import("@/lib/errors");
  return {
    CLUB_COOKIE: "kk_club",
    requireUser: async () => {
      if (!state.current) throw new KelabError("UNAUTHENTICATED");
      return { id: state.current.userId, name: state.current.name, email: "x@example.test", image: null };
    },
    requireCtx: async () => {
      if (!state.current) throw new KelabError("UNAUTHENTICATED");
      if (!state.current.clubId) throw new KelabError("NO_CLUB");
      return { userId: state.current.userId, clubId: state.current.clubId, userName: state.current.name };
    },
  };
});

const { neonBackend: backend } = await import("@/lib/backend/neon");
const { createClub } = await import("@/app/actions/club");
const { closePool } = await import("@/lib/db/with-club");

const userA = randomUUID();
const userB = randomUUID();
let clubA: string;
let clubB: string;
let admin: ReturnType<typeof createPool>;

const as = (userId: string | null, clubId: string | null, name = "Bendahari Ujian") => (state.current = userId ? { userId, clubId, name } : null);
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(KelabError);
    return (error as KelabError).code;
  }
  throw new Error("expected refusal");
};
const myt = today();

async function newClub(user: string, label: string) {
  as(user, null);
  const result = await createClub({ name: `kk-test-${label}-${randomUUID()}`, session: "2026", school: "SK Ujian", treasurerName: null });
  if (!result.ok) throw new Error(`createClub failed: ${result.code}`);
  return result.value;
}

const TABLES = ["audit_logs", "attachments", "payment_allocations", "payments", "charges", "participants", "collection_periods", "collections", "members", "club_settings", "club_members"];
async function dropClub(club: string) {
  for (const table of TABLES) await admin.query(`delete from ${table} where club_id = $1`, [club]);
  await admin.query("delete from clubs where id = $1", [club]);
}

beforeAll(async () => {
  admin = createPool();
  for (const { id } of (await admin.query("select id from clubs where name like 'kk-test-%'")).rows) await dropClub(id);
  clubA = await newClub(userA, "neon-a");
  clubB = await newClub(userB, "neon-b");
});
afterAll(async () => {
  for (const club of [clubA, clubB]) if (club) await dropClub(club);
  await admin?.end();
  await closePool();
});

describe("session and club resolution", () => {
  it("no session: every operation is refused as UNAUTHENTICATED and nothing reaches the database", async () => {
    as(null, null);
    expect(await codeOf(backend.load())).toBe("UNAUTHENTICATED");
    expect(await codeOf(backend.addMembers([{ name: "Hantu", category: null, phone: null, notes: null }]))).toBe("UNAUTHENTICATED");
  });

  it("a signed-in user without a club gets NO_CLUB", async () => {
    as(randomUUID(), null);
    expect(await codeOf(backend.load())).toBe("NO_CLUB");
  });

  it("createClub made an owner membership and an empty club", async () => {
    as(userA, clubA);
    const snap = await backend.load();
    expect(snap.club).toMatchObject({ id: clubA, session: "2026", school: "SK Ujian", treasurerName: "Bendahari Ujian" });
    expect([snap.members, snap.collections, snap.charges, snap.payments].map((x) => x.length)).toEqual([0, 0, 0, 0]);
    expect(snap.audit.map((a) => a.summary)).toEqual([expect.stringContaining("dicipta")]);
  });
});

describe("full flow as club A's owner", () => {
  let m1: string;
  let m2: string;
  let oneOff: string;
  let monthly: string;
  let voluntary: string;
  let charge1: string;

  it("adds members (duplicates refused) and creates one-off, monthly and voluntary collections", async () => {
    as(userA, clubA);
    [m1, m2] = await backend.addMembers([
      { name: "Aina Sofea", category: "guru", phone: null, notes: null },
      { name: "Hafiz Rahman", category: "kakitangan", phone: "0123456789", notes: null },
    ]);
    expect(await codeOf(backend.addMembers([{ name: "cikgu aina  sofea", category: null, phone: null, notes: null }]))).toBe("MEMBER_DUPLICATE");

    oneOff = await backend.createCollection({
      name: "Jamuan", type: "one_off", defaultAmount: 10000, description: null, notes: null, dueDate: "2026-12-01",
      startMonth: null, endMonth: null, dueDay: null, icon: "🍽️", activate: true,
      participants: [
        { memberId: m1, amountOverride: null, exempt: false, note: null },
        { memberId: m2, amountOverride: 5000, exempt: false, note: null },
      ],
    });
    monthly = await backend.createCollection({
      name: "Yuran bulanan", type: "monthly", defaultAmount: 1000, description: null, notes: null, dueDate: null,
      startMonth: "2026-01", endMonth: "2026-03", dueDay: 31, activate: true,
      participants: [{ memberId: m1, amountOverride: null, exempt: false, note: null }, { memberId: m2, amountOverride: null, exempt: true, note: "Cuti belajar" }],
    });
    voluntary = await backend.createCollection({
      name: "Tabung sumbangan", type: "voluntary", defaultAmount: null, description: null, notes: null, dueDate: null,
      startMonth: null, endMonth: null, dueDay: null, activate: true,
      participants: [{ memberId: m1, amountOverride: null, exempt: false, note: null }],
    });
    expect(await codeOf(backend.createCollection({ name: "jamuan", type: "voluntary", defaultAmount: null, description: null, notes: null, dueDate: null, startMonth: null, endMonth: null, dueDay: null, activate: false, participants: [] }))).toBe("COLLECTION_DUPLICATE");

    const snap = await backend.load();
    expect(snap.charges.filter((c) => c.collectionId === oneOff)).toHaveLength(2);
    expect(snap.charges.filter((c) => c.collectionId === monthly)).toHaveLength(6);
    expect(snap.charges.filter((c) => c.collectionId === voluntary)).toHaveLength(0);
    expect(snap.periods.filter((p) => p.collectionId === monthly).map((p) => [p.month, p.dueDate])).toEqual([
      ["2026-01", "2026-01-31"], ["2026-02", "2026-02-28"], ["2026-03", "2026-03-31"],
    ]);
    expect(snap.collections.find((c) => c.id === monthly)).toMatchObject({ startMonth: "2026-01", endMonth: "2026-03", dueDay: 31 });
    expect(snap.collections.find((c) => c.id === oneOff)).toMatchObject({ icon: "🍽️", dueDate: "2026-12-01", status: "active" });
    charge1 = snap.charges.find((c) => c.collectionId === oneOff && c.memberId === m1)!.id;
    expect(snap.charges.filter((c) => c.collectionId === monthly && c.memberId === m2).every((c) => c.exempt && c.exemptReason === "Cuti belajar")).toBe(true);
    // The unchanged UI read model accepts the SQL-built snapshot.
    expect(() => buildView(snap, today())).not.toThrow();
  });

  it("records a payment once per idempotency key, refuses overpayment, and the ledger agrees with lib/money", async () => {
    as(userA, clubA);
    const input = { idempotencyKey: randomUUID(), memberId: m1, method: "cash" as const, paidOn: myt, reference: null, note: null, confirmed: true, allocations: [{ chargeId: charge1, amount: 4000 }] };
    const id = await backend.recordPayment(input);
    expect(await backend.recordPayment(input)).toBe(id); // retry with the same key
    expect(await codeOf(backend.recordPayment({ ...input, idempotencyKey: randomUUID(), allocations: [{ chargeId: charge1, amount: 6001 }] }))).toBe("OVERPAYMENT");
    const snap = await backend.load();
    expect(snap.payments.filter((p) => p.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
    expect(snap.allocations.filter((a) => a.paymentId === id)).toHaveLength(1);
    const charge = snap.charges.find((c) => c.id === charge1)!;
    const ledger = chargeLedger(charge, indexLedger(snap.payments, snap.allocations, snap.periods), today());
    expect(ledger).toMatchObject({ confirmed: 4000, remaining: 6000, status: "partial" });
    const sqlLedger = (await admin.query("select confirmed, remaining, status from charge_ledger where charge_id = $1", [charge1])).rows[0];
    expect(sqlLedger).toMatchObject({ confirmed: "4000", remaining: "6000", status: "partial" });
  });

  it("pending then confirm; reverse needs a reason, keeps the row and frees the money", async () => {
    as(userA, clubA);
    const key = randomUUID();
    const id = await backend.recordPayment({ idempotencyKey: key, memberId: m1, method: "transfer", paidOn: myt, reference: "TRX1", note: null, confirmed: false, allocations: [{ chargeId: charge1, amount: 6000 }] });
    let snap = await backend.load();
    expect(snap.payments.find((p) => p.id === id)).toMatchObject({ state: "pending", reference: "TRX1", confirmedAt: null });
    await backend.confirmPayment(id);
    expect(await codeOf(backend.confirmPayment(id))).toBe("PAYMENT_NOT_PENDING");
    expect(await codeOf(backend.reversePayment(id, "  "))).toBe("REASON_REQUIRED");
    await backend.reversePayment(id, "Salah ahli");
    expect(await codeOf(backend.reversePayment(id, "lagi"))).toBe("PAYMENT_ALREADY_REVERSED");
    snap = await backend.load();
    expect(snap.payments.find((p) => p.id === id)).toMatchObject({ state: "reversed", reversalReason: "Salah ahli" });
    expect(snap.allocations.some((a) => a.paymentId === id)).toBe(true); // history is kept
    const ledger = chargeLedger(snap.charges.find((c) => c.id === charge1)!, indexLedger(snap.payments, snap.allocations, snap.periods), today());
    expect(ledger.confirmed).toBe(4000);
    expect(snap.audit.filter((a) => a.entityId === id).map((a) => a.action).sort()).toEqual(["payment.confirm", "payment.record", "payment.reverse"]);
  });

  it("voluntary contribution, charge amount and exemption rules", async () => {
    as(userA, clubA);
    const key = randomUUID();
    const id = await backend.recordContribution({ idempotencyKey: key, memberId: m1, collectionId: voluntary, method: "cash", paidOn: myt, reference: null, note: null, confirmed: true, amount: 2500 });
    expect(await backend.recordContribution({ idempotencyKey: key, memberId: m1, collectionId: voluntary, method: "cash", paidOn: myt, reference: null, note: null, confirmed: true, amount: 2500 })).toBe(id);
    expect(await codeOf(backend.setChargeAmount(charge1, 3999, "turun"))).toBe("AMOUNT_BELOW_PAID");
    expect(await codeOf(backend.setChargeAmount(charge1, 12000, null))).toBe("REASON_REQUIRED");
    await backend.setChargeAmount(charge1, 12000, "Tambah makanan");
    expect(await codeOf(backend.setChargeExempt(charge1, true, "x"))).toBe("AMOUNT_BELOW_PAID");
    const snap = await backend.load();
    const other = snap.charges.find((c) => c.collectionId === oneOff && c.memberId === m2)!;
    await backend.setChargeExempt(other.id, true, "Dikecualikan");
    expect((await backend.load()).charges.find((c) => c.id === other.id)).toMatchObject({ exempt: true, exemptReason: "Dikecualikan" });
    expect(snap.charges.find((c) => c.id === charge1)!.amount).toBe(12000);
  });

  it("members, collections, club: updates, status, icon, participants, due date", async () => {
    as(userA, clubA);
    await backend.updateMember(m2, { name: "Hafiz R.", phone: null });
    await backend.setMemberActive(m2, false);
    const m3 = (await backend.addMembers([{ name: "Rosnah Ahmad", category: null, phone: null, notes: null }]))[0];
    await backend.addParticipants(oneOff, [{ memberId: m3, amountOverride: null, exempt: false, note: null }]);
    expect(await codeOf(backend.addParticipants(oneOff, [{ memberId: m3, amountOverride: null, exempt: false, note: null }]))).toBe("PARTICIPANT_EXISTS");
    await backend.updateCollection(oneOff, { name: "Jamuan akhir tahun", dueDate: "2027-01-15" });
    await backend.setCollectionIcon(oneOff, "lucide:gift");
    await backend.updateClub({ treasurerName: "Puan Bendahari" });
    let snap = await backend.load();
    expect(snap.members.find((m) => m.id === m2)).toMatchObject({ name: "Hafiz R.", active: false });
    expect(snap.collections.find((c) => c.id === oneOff)).toMatchObject({ name: "Jamuan akhir tahun", dueDate: "2027-01-15", icon: "lucide:gift" });
    expect(snap.charges.filter((c) => c.collectionId === oneOff).every((c) => c.dueDate === "2027-01-15")).toBe(true);
    expect(snap.club.treasurerName).toBe("Puan Bendahari");
    await backend.setCollectionStatus(oneOff, "archived");
    snap = await backend.load();
    expect(snap.collections.find((c) => c.id === oneOff)!.status).toBe("archived");
    const charge = snap.charges.find((c) => c.collectionId === oneOff && c.memberId === m3)!;
    expect(await codeOf(backend.recordPayment({ idempotencyKey: randomUUID(), memberId: m3, method: "cash", paidOn: myt, reference: null, note: null, confirmed: true, allocations: [{ chargeId: charge.id, amount: 100 }] }))).toBe("COLLECTION_ARCHIVED");
    expect(snap.audit.every((a) => a.actor && a.summary)).toBe(true);
  });

  it("attachment bytes are not available yet; metadata reads work", async () => {
    as(userA, clubA);
    const file = new File([new Uint8Array([1, 2, 3])], "bukti.png", { type: "image/png" });
    expect(await codeOf(backend.addAttachments("x", [file]))).toBe("NOT_AVAILABLE");
    expect(await codeOf(backend.removeAttachment("x", "y"))).toBe("NOT_AVAILABLE");
    expect(await codeOf(backend.getAttachmentBlob("x"))).toBe("NOT_AVAILABLE");
    expect((await backend.load()).attachments).toEqual([]);
  });
});

describe("cross-club isolation through the action layer", () => {
  it("user B cannot read or act in club A, even by naming it", async () => {
    // The session layer resolved this pairing; the database refuses it regardless.
    as(userB, clubA);
    expect(await codeOf(backend.load())).toBe("FORBIDDEN");
    expect(await codeOf(backend.addMembers([{ name: "Penceroboh", category: null, phone: null, notes: null }]))).toBe("FORBIDDEN");
    expect(await codeOf(backend.updateClub({ name: "Dirampas" }))).toBe("FORBIDDEN");
    expect(Number((await admin.query("select count(*) n from members where club_id = $1 and name = 'Penceroboh'", [clubA])).rows[0].n)).toBe(0);
  });

  it("user A, acting in club A, cannot touch a charge, payment or member that belongs to club B", async () => {
    as(userB, clubB);
    const [mb] = await backend.addMembers([{ name: "Ahli Kelab B", category: null, phone: null, notes: null }]);
    const col = await backend.createCollection({
      name: "B satu", type: "one_off", defaultAmount: 1000, description: null, notes: null, dueDate: null, startMonth: null, endMonth: null, dueDay: null, activate: true,
      participants: [{ memberId: mb, amountOverride: null, exempt: false, note: null }],
    });
    const snapB = await backend.load();
    const chargeB = snapB.charges.find((c) => c.collectionId === col)!;
    const payB = await backend.recordPayment({ idempotencyKey: randomUUID(), memberId: mb, method: "cash", paidOn: myt, reference: null, note: null, confirmed: false, allocations: [{ chargeId: chargeB.id, amount: 500 }] });

    as(userA, clubA);
    expect(await codeOf(backend.setChargeAmount(chargeB.id, 5, "x"))).toBe("CHARGE_NOT_FOUND");
    expect(await codeOf(backend.confirmPayment(payB))).toBe("PAYMENT_NOT_FOUND");
    expect(await codeOf(backend.reversePayment(payB, "x"))).toBe("PAYMENT_NOT_FOUND");
    expect(await codeOf(backend.updateMember(mb, { name: "Dirampas" }))).toBe("MEMBER_NOT_FOUND");
    expect(await codeOf(backend.addParticipants(col, []))).toBe("COLLECTION_NOT_FOUND");
    const snapA = await backend.load();
    expect(JSON.stringify(snapA)).not.toContain(mb);
    expect(snapA.payments.some((p) => p.id === payB)).toBe(false);
    // B's data is untouched.
    as(userB, clubB);
    expect((await backend.load()).payments.find((p) => p.id === payB)).toMatchObject({ state: "pending", amount: 500 });
  });
});
