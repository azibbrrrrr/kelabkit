// The neon backend end to end, minus Google: neonBackend -> server actions -> service ->
// withClub -> Postgres (dev branch). Only the session lookup is replaced, with a seeded user
// id; everything else is the production path. Clubs are named "kk-test-<runId>-*" and deleted after.

import { runPrefix } from "./guard";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { KelabError } from "@/lib/errors";
import { today } from "@/lib/format";
import { chargeLedger, indexLedger } from "@/lib/money/ledger";
import { buildView } from "@/lib/view";
import { createPool } from "../client";

type Current = { userId: string; clubId: string | null; name: string; fromCookie?: boolean } | null;
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
      return { userId: state.current.userId, clubId: state.current.clubId, userName: state.current.name, fromCookie: state.current.fromCookie };
    },
    // What the real resolveClub does, minus the cookie write: the user's oldest club from the database.
    resolveClub: async (user: { id: string; name: string }) => {
      const { listClubs } = await import("@/lib/server/service");
      const [club] = await listClubs(user.id);
      if (!club) throw new KelabError("NO_CLUB");
      return { userId: user.id, clubId: club.id, userName: user.name };
    },
    setClubCookie: async () => undefined,
  };
});

const { neonBackend: backend, setSnapshotSink } = await import("@/lib/backend/neon");
const { createClub } = await import("@/app/actions/club");
const { closePool } = await import("@/lib/db/with-club");

const userA = randomUUID();
const userB = randomUUID();
let clubA: string;
let clubB: string;
let clubC: string;
let admin: ReturnType<typeof createPool>;

const as = (userId: string | null, clubId: string | null, name = "Bendahari Ujian", fromCookie = false) => (state.current = userId ? { userId, clubId, name, fromCookie } : null);
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
  const result = await createClub({ name: `${runPrefix()}${label}-${randomUUID()}`, session: "2026", school: "SK Ujian", treasurerName: null });
  if (!result.ok) throw new Error(`createClub failed: ${result.code}`);
  return result.value;
}

// Objects the tests wrote. Listed straight from the bucket so a leak shows up as a failure, not silence.
const storage = () => {
  const env = process.env;
  return {
    bucket: env.NEON_STORAGE_BUCKET!,
    client: new S3Client({ endpoint: env.NEON_STORAGE_ENDPOINT, region: env.NEON_STORAGE_REGION, forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", credentials: { accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID!, secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY! } }),
  };
};
async function storedKeys(prefix: string) {
  const { client, bucket } = storage();
  const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (out.Contents ?? []).map((o) => o.Key!).sort();
}
async function wipeStored(club: string) {
  const { client, bucket } = storage();
  for (const Key of await storedKeys(`clubs/${club}/`)) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
}

const TABLES = ["audit_logs", "attachments", "payment_allocations", "payments", "charges", "participants", "collection_periods", "collections", "members", "club_settings", "club_members"];
async function dropClub(club: string) {
  // Mutating actions spend the session user's rate budget (migration 0006); the test users' buckets go with their club.
  await admin.query("delete from rate_limits where bucket in (select 'mutation:' || user_id::text from club_members where club_id = $1)", [club]);
  for (const table of TABLES) await admin.query(`delete from ${table} where club_id = $1`, [club]);
  await admin.query("delete from clubs where id = $1", [club]);
}

beforeAll(async () => {
  admin = createPool();
  clubA = await newClub(userA, "neon-a");
  clubB = await newClub(userB, "neon-b");
  clubC = await newClub(userA, "neon-c");
});
afterAll(async () => {
  for (const club of [clubA, clubB, clubC]) if (club) await wipeStored(club);
  for (const club of [clubA, clubB, clubC]) if (club) await dropClub(club);
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

  it("proof files: presigned upload, confirm, read back, soft remove deletes the object, history kept", async () => {
    as(userA, clubA);
    const payment = await backend.recordContribution({ idempotencyKey: randomUUID(), memberId: m1, collectionId: voluntary, method: "cash", paidOn: myt, reference: null, note: null, confirmed: true, amount: 700 });
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const png = new File([bytes], "bukti.png", { type: "image/png" });
    const pdf = new File([new Uint8Array([37, 80, 68, 70, 9])], "resit.pdf", { type: "application/pdf" });

    const [id, pdfId] = await backend.addAttachments(payment, [png, pdf]);
    let snap = await backend.load();
    const row = snap.attachments.find((a) => a.id === id)!;
    expect(row).toMatchObject({ paymentId: payment, fileName: "bukti.png", mimeType: "image/png", sizeBytes: 8, removedAt: null });
    expect(snap.audit.some((a) => a.summary.includes('Bukti "bukti.png" dilampirkan'))).toBe(true);
    const key = `clubs/${clubA}/payments/${payment}/${id}`;
    expect((await admin.query("select storage_key from attachments where id = $1", [id])).rows[0].storage_key).toBe(key);
    expect(await storedKeys(`clubs/${clubA}/payments/${payment}/`)).toEqual([key, `clubs/${clubA}/payments/${payment}/${pdfId}`].sort());

    const blob = await backend.getAttachmentBlob(id);
    expect(blob.type).toBe("image/png");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([...bytes]);

    // refusals: same file twice, wrong type, sixth file
    expect(await codeOf(backend.addAttachments(payment, [png]))).toBe("ATTACHMENT_DUPLICATE");
    expect(await codeOf(backend.addAttachments(payment, [new File([new Uint8Array([1])], "a.xlsx", { type: "application/vnd.ms-excel" })]))).toBe("ATTACHMENT_TYPE");
    const more = [3, 4, 5].map((n) => new File([new Uint8Array([n, n])], `f${n}.png`, { type: "image/png" }));
    await backend.addAttachments(payment, more);
    expect(await codeOf(backend.addAttachments(payment, [new File([new Uint8Array([9, 9, 9])], "g.png", { type: "image/png" })]))).toBe("ATTACHMENT_LIMIT");
    expect(await storedKeys(`clubs/${clubA}/payments/${payment}/`)).toHaveLength(5);

    // soft remove: row stays with reason, object is gone, viewing is refused
    await backend.removeAttachment(id, "fail salah");
    snap = await backend.load();
    expect(snap.attachments.find((a) => a.id === id)).toMatchObject({ removedReason: "fail salah" });
    expect(snap.attachments.find((a) => a.id === id)!.removedAt).not.toBeNull();
    expect(await storedKeys(key)).toEqual([]);
    expect(await codeOf(backend.getAttachmentBlob(id))).toBe("ATTACHMENT_ALREADY_REMOVED");
    expect(await codeOf(backend.removeAttachment(id, "lagi"))).toBe("ATTACHMENT_ALREADY_REMOVED");
    expect(await codeOf(backend.removeAttachment(pdfId, "  "))).toBe("REASON_REQUIRED");
    expect(await storedKeys(`clubs/${clubA}/payments/${payment}/${pdfId}`)).toHaveLength(1);
  });

  it("an upload whose bytes differ from what was approved is refused and leaves no object or row", async () => {
    as(userA, clubA);
    const payment = await backend.recordContribution({ idempotencyKey: randomUUID(), memberId: m2, collectionId: voluntary, method: "cash", paidOn: myt, reference: null, note: null, confirmed: true, amount: 300 });
    const { prepareAttachmentUploads, confirmAttachmentUploads } = await import("@/app/actions/attachments");
    const prep = await prepareAttachmentUploads(payment, [{ fileName: "a.png", mimeType: "image/png", sizeBytes: 4 }]);
    if (!prep.ok) throw new Error(prep.code);
    const [{ attachmentId, url }] = prep.value;
    const meta = { attachmentId, fileName: "a.png", mimeType: "image/png", sizeBytes: 4, sha256: "b".repeat(64) };
    // nothing uploaded yet
    expect(await confirmAttachmentUploads(payment, [meta])).toMatchObject({ ok: false, code: "ATTACHMENT_UPLOAD_FAILED" });
    // a different size than approved: the store itself refuses
    expect((await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(5) })).ok).toBe(false);
    // right size, wrong content type: stored, then confirm refuses and removes it
    expect((await fetch(url, { method: "PUT", headers: { "Content-Type": "text/html" }, body: new Uint8Array(4) })).ok).toBe(true);
    expect(await confirmAttachmentUploads(payment, [meta])).toMatchObject({ ok: false, code: "ATTACHMENT_UPLOAD_FAILED" });
    expect(await storedKeys(`clubs/${clubA}/payments/${payment}/`)).toEqual([]);
    expect(Number((await admin.query("select count(*) n from attachments where payment_id = $1", [payment])).rows[0].n)).toBe(0);
  });
});

describe("club settings (Tetapan > Maklumat kelab)", () => {
  it("every field the form shows persists, each save leaves an audit row, and the snapshot returns it", async () => {
    as(userA, clubC);
    const auditCount = async () => (await backend.load()).audit.filter((a) => a.action === "club.update").length;
    const before = await auditCount();
    await backend.updateClub({ name: "  Kelab   Baharu ", school: "SMK Contoh", session: "2027", treasurerName: "Puan  Aminah" });
    let snap = await backend.load();
    expect(snap.club).toMatchObject({ id: clubC, name: "Kelab Baharu", school: "SMK Contoh", session: "2027", treasurerName: "Puan Aminah" });
    expect(await auditCount()).toBe(before + 1);
    // Stored, not just echoed: read through the owner connection.
    const row = (await admin.query("select name, school, session, treasurer_name from clubs where id = $1", [clubC])).rows[0];
    expect(row).toEqual({ name: "Kelab Baharu", school: "SMK Contoh", session: "2027", treasurer_name: "Puan Aminah" });
    // A blank school clears it; fields not mentioned keep their value.
    await backend.updateClub({ school: "  " });
    snap = await backend.load();
    expect(snap.club).toMatchObject({ school: null, name: "Kelab Baharu", session: "2027" });
    expect(await auditCount()).toBe(before + 2);
  });

  it("is refused on the server with the form's limits, and a refusal writes nothing", async () => {
    as(userA, clubC);
    const audits = async () => Number((await admin.query("select count(*) n from audit_logs where club_id = $1", [clubC])).rows[0].n);
    const n = await audits();
    expect(await codeOf(backend.updateClub({ name: " " }))).toBe("NAME_REQUIRED");
    expect(await codeOf(backend.updateClub({ name: "a".repeat(121) }))).toBe("NAME_TOO_LONG");
    expect(await codeOf(backend.updateClub({ treasurerName: "" }))).toBe("NAME_REQUIRED");
    expect(await codeOf(backend.updateClub({ session: "  " }))).toBe("SESSION_REQUIRED");
    expect(await codeOf(backend.updateClub({ session: "s".repeat(41) }))).toBe("SESSION_TOO_LONG");
    expect(await codeOf(backend.updateClub({ school: "s".repeat(121) }))).toBe("SCHOOL_TOO_LONG");
    expect(await audits()).toBe(n);
    expect((await admin.query("select name, session from clubs where id = $1", [clubC])).rows[0]).toEqual({ name: "Kelab Baharu", session: "2027" });
  });

  it("another user cannot change this club", async () => {
    as(userB, clubC);
    expect(await codeOf(backend.updateClub({ name: "Dirampas" }))).toBe("FORBIDDEN");
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
    // proof: A cannot attach to, read or remove B's proof
    expect(await codeOf(backend.addAttachments(payB, [new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" })]))).toBe("FORBIDDEN");
    expect(await storedKeys(`clubs/${clubA}/payments/${payB}`)).toEqual([]);
    as(userB, clubB);
    const [bProof] = await backend.addAttachments(payB, [new File([new Uint8Array([7, 7, 7])], "b.png", { type: "image/png" })]);
    as(userA, clubA);
    expect(await codeOf(backend.getAttachmentBlob(bProof))).toBe("ATTACHMENT_NOT_FOUND");
    expect(await codeOf(backend.removeAttachment(bProof, "x"))).toBe("ATTACHMENT_NOT_FOUND");
    expect(await storedKeys(`clubs/${clubB}/payments/${payB}/${bProof}`)).toHaveLength(1);
    expect(await codeOf(backend.addParticipants(col, []))).toBe("COLLECTION_NOT_FOUND");
    const snapA = await backend.load();
    expect(JSON.stringify(snapA)).not.toContain(mb);
    expect(snapA.payments.some((p) => p.id === payB)).toBe(false);
    // B's data is untouched.
    as(userB, clubB);
    expect((await backend.load()).payments.find((p) => p.id === payB)).toMatchObject({ state: "pending", amount: 500 });
  });
});

describe("one transaction per action", () => {
  it("a change returns the snapshot its own transaction read, and the load is the same single transaction", async () => {
    as(userA, clubA);
    const seen: { payments: number; members: number }[] = [];
    setSnapshotSink((snapshot) => seen.push({ payments: snapshot.payments.length, members: snapshot.members.length }));
    try {
      const before = await backend.load();
      expect(seen).toHaveLength(0); // a plain load returns its value, not a pushed snapshot
      await backend.addMembers([{ name: `Ahli Segera ${randomUUID().slice(0, 6)}`, category: null, phone: null, notes: null }]);
      expect(seen).toEqual([{ payments: before.payments.length, members: before.members.length + 1 }]);
      const after = await backend.load();
      expect(after.members).toHaveLength(before.members.length + 1);
    } finally {
      setSnapshotSink(null);
    }
  });

  it("a refused change pushes no snapshot", async () => {
    as(userA, clubA);
    let pushed = 0;
    setSnapshotSink(() => (pushed += 1));
    try {
      expect(await codeOf(backend.addMembers([{ name: "  ", category: null, phone: null, notes: null }]))).not.toBe("");
      expect(pushed).toBe(0);
    } finally {
      setSnapshotSink(null);
    }
  });

  it("a club id from the cookie that is not the user's is checked in the transaction and replaced", async () => {
    // userA's cookie names club B: the membership check refuses it, act() looks up A's own club.
    as(userA, clubB, "Bendahari Ujian", true);
    const snap = await backend.load();
    expect(snap.club.id).toBe(clubA);
  });

  it("a cookie club the user does belong to is used without a lookup", async () => {
    as(userB, clubB, "Bendahari Ujian", true);
    expect((await backend.load()).club.id).toBe(clubB);
  });
});
