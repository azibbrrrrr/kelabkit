// Demo backend for Phase 1. Keeps the snapshot in this browser's localStorage so edits
// survive a refresh, and enforces the same rules the Neon backend will enforce on the
// server: integer sen, no overpayment, no amount below what is paid, reasons for
// reversals and exemptions, idempotent payment recording, an audit row per change.
// "Set semula data demo" in Tetapan restores the seed.

import type {
  ClubChanges,
  CollectionChanges,
  ContributionInput,
  KelabBackend,
  MemberChanges,
  NewCollection,
  NewMember,
  NewParticipant,
  PaymentInput,
} from "@/lib/backend/types";
import { buildSeed } from "@/lib/backend/seed";
import { KelabError } from "@/lib/errors";
import { normaliseName } from "@/lib/names";
import { formatMoney, today } from "@/lib/format";
import { MAX_AMOUNT_SEN } from "@/lib/money/amount";
import { chargeLedger, indexLedger } from "@/lib/money/ledger";
import { dueDateFor, isMonth, monthsBetween } from "@/lib/money/months";
import type { AuditAction, Charge, Collection, CollectionStatus, Sen, Snapshot } from "@/lib/types";

const STORAGE_KEY = "kelabkit-demo-v1";
const LATENCY_MS = 220;

let memory: Snapshot | null = null;

function read(): Snapshot {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memory = JSON.parse(raw) as Snapshot;
      return memory;
    }
  } catch {
    // Private mode or blocked storage: fall through to a fresh seed held in memory.
  }
  memory = buildSeed(today());
  write(memory);
  return memory;
}

function write(state: Snapshot) {
  memory = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the session still works from memory.
  }
}

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();
const clone = (state: Snapshot) => structuredClone(state);

function cleanName(name: string) {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) throw new KelabError("NAME_REQUIRED");
  if (value.length > 120) throw new KelabError("NAME_TOO_LONG");
  return value;
}

function checkAmount(amount: Sen, allowZero = false) {
  if (!Number.isInteger(amount)) throw new KelabError("AMOUNT_INVALID");
  if (amount < 0) throw new KelabError("AMOUNT_NEGATIVE");
  if (amount === 0 && !allowZero) throw new KelabError("AMOUNT_ZERO");
  if (amount > MAX_AMOUNT_SEN) throw new KelabError("AMOUNT_TOO_LARGE");
}

function checkReason(reason: string | null | undefined) {
  if (!reason || !reason.trim()) throw new KelabError("REASON_REQUIRED");
  return reason.trim();
}

function audit(state: Snapshot, action: AuditAction, entityId: string, summary: string, reason: string | null = null) {
  state.audit.unshift({ id: uid("a"), at: now(), actor: state.club.treasurerName, action, summary, entityId, reason });
}

function findCollection(state: Snapshot, id: string): Collection {
  const collection = state.collections.find((row) => row.id === id);
  if (!collection) throw new KelabError("COLLECTION_NOT_FOUND");
  return collection;
}

function memberName(state: Snapshot, id: string) {
  return state.members.find((member) => member.id === id)?.name ?? "Ahli";
}

/** Creates charges for a participant: one per period for monthly, one for one-off, none for voluntary. */
function chargesFor(state: Snapshot, collection: Collection, participant: NewParticipant): Charge[] {
  if (collection.type === "voluntary") return [];
  const amount = participant.amountOverride ?? collection.defaultAmount ?? 0;
  const base = {
    collectionId: collection.id,
    memberId: participant.memberId,
    amount,
    exempt: participant.exempt,
    exemptReason: participant.exempt ? participant.note || "Dikecualikan semasa kutipan dicipta" : null,
    note: participant.exempt ? null : participant.note,
  };
  if (collection.type === "one_off") return [{ ...base, id: uid("ch"), periodId: null, dueDate: collection.dueDate }];
  return state.periods
    .filter((period) => period.collectionId === collection.id)
    .map((period) => ({ ...base, id: uid("ch"), periodId: period.id, dueDate: period.dueDate }));
}

function validateParticipants(collection: Collection, participants: NewParticipant[]) {
  for (const participant of participants) {
    if (collection.type === "voluntary") continue;
    const amount = participant.amountOverride ?? collection.defaultAmount ?? 0;
    if (!participant.exempt) checkAmount(amount);
  }
}

export const demoBackend: KelabBackend = {
  kind: "demo",

  async load() {
    await wait();
    return clone(read());
  },

  async addMembers(input: NewMember[]) {
    await wait();
    const state = clone(read());
    const ids: string[] = [];
    const seen = new Set(state.members.map((member) => normaliseName(member.name)));
    for (const row of input) {
      const name = cleanName(row.name);
      const key = normaliseName(name);
      if (seen.has(key) && !row.allowDuplicate) throw new KelabError("MEMBER_DUPLICATE", name);
      seen.add(key);
      const id = uid("m");
      const at = now();
      state.members.push({
        id,
        name,
        category: row.category,
        phone: row.phone?.trim() || null,
        notes: row.notes?.trim() || null,
        active: true,
        joinedOn: today(),
        createdAt: at,
        updatedAt: at,
      });
      audit(state, "member.create", id, `${name} ditambah sebagai ahli`);
      ids.push(id);
    }
    write(state);
    return ids;
  },

  async updateMember(id, changes: MemberChanges) {
    await wait();
    const state = clone(read());
    const member = state.members.find((row) => row.id === id);
    if (!member) throw new KelabError("MEMBER_NOT_FOUND");
    if (changes.name !== undefined) {
      const name = cleanName(changes.name);
      const clash = state.members.some((row) => row.id !== id && normaliseName(row.name) === normaliseName(name));
      if (clash) throw new KelabError("MEMBER_DUPLICATE", name);
      member.name = name;
    }
    if (changes.category !== undefined) member.category = changes.category;
    if (changes.phone !== undefined) member.phone = changes.phone?.trim() || null;
    if (changes.notes !== undefined) member.notes = changes.notes?.trim() || null;
    member.updatedAt = now();
    audit(state, "member.update", id, `Maklumat ${member.name} dikemas kini`);
    write(state);
  },

  async setMemberActive(id, activeFlag) {
    await wait();
    const state = clone(read());
    const member = state.members.find((row) => row.id === id);
    if (!member) throw new KelabError("MEMBER_NOT_FOUND");
    member.active = activeFlag;
    member.updatedAt = now();
    audit(
      state,
      activeFlag ? "member.reactivate" : "member.deactivate",
      id,
      `${member.name} ${activeFlag ? "diaktifkan semula" : "dinyahaktifkan"}; rekod bayaran dikekalkan`,
    );
    write(state);
  },

  async createCollection(input: NewCollection) {
    await wait();
    const state = clone(read());
    const name = cleanName(input.name);
    if (state.collections.some((row) => row.status !== "archived" && normaliseName(row.name) === normaliseName(name)))
      throw new KelabError("COLLECTION_DUPLICATE");
    if (input.type !== "voluntary") checkAmount(input.defaultAmount ?? 0);
    if (input.type === "monthly") {
      if (!input.startMonth || !input.endMonth || !isMonth(input.startMonth) || !isMonth(input.endMonth))
        throw new KelabError("MONTH_RANGE_INVALID");
      const months = monthsBetween(input.startMonth, input.endMonth);
      if (!months.length) throw new KelabError("MONTH_RANGE_INVALID");
      if (months.length > 36) throw new KelabError("MONTH_RANGE_TOO_LONG");
      if (input.dueDay !== null && (input.dueDay < 1 || input.dueDay > 31)) throw new KelabError("DUE_DAY_INVALID");
    }
    if (input.activate && !input.participants.length) throw new KelabError("COLLECTION_NO_MEMBERS");
    const at = now();
    const collection: Collection = {
      id: uid("c"),
      name,
      type: input.type,
      status: input.activate ? "active" : "draft",
      defaultAmount: input.type === "voluntary" ? null : input.defaultAmount,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      dueDate: input.type === "one_off" ? input.dueDate : null,
      startMonth: input.type === "monthly" ? input.startMonth : null,
      endMonth: input.type === "monthly" ? input.endMonth : null,
      dueDay: input.type === "monthly" ? input.dueDay : null,
      createdAt: at,
      updatedAt: at,
    };
    validateParticipants(collection, input.participants);
    state.collections.push(collection);
    if (collection.type === "monthly") {
      for (const month of monthsBetween(collection.startMonth!, collection.endMonth!)) {
        state.periods.push({ id: uid("pr"), collectionId: collection.id, month, dueDate: dueDateFor(month, collection.dueDay) });
      }
    }
    for (const participant of input.participants) {
      state.participants.push({ collectionId: collection.id, ...participant });
      state.charges.push(...chargesFor(state, collection, participant));
    }
    audit(state, "collection.create", collection.id, `Kutipan "${name}" dicipta untuk ${input.participants.length} ahli`);
    write(state);
    return collection.id;
  },

  async updateCollection(id, changes: CollectionChanges) {
    await wait();
    const state = clone(read());
    const collection = findCollection(state, id);
    if (collection.status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
    if (changes.name !== undefined) {
      const name = cleanName(changes.name);
      const clash = state.collections.some(
        (row) => row.id !== id && row.status !== "archived" && normaliseName(row.name) === normaliseName(name),
      );
      if (clash) throw new KelabError("COLLECTION_DUPLICATE");
      if (name !== collection.name) audit(state, "collection.rename", id, `"${collection.name}" dinamakan semula kepada "${name}"`);
      collection.name = name;
    }
    if (changes.description !== undefined) collection.description = changes.description?.trim() || null;
    if (changes.notes !== undefined) collection.notes = changes.notes?.trim() || null;
    if (changes.dueDate !== undefined && collection.type === "one_off") {
      collection.dueDate = changes.dueDate;
      for (const charge of state.charges.filter((row) => row.collectionId === id)) charge.dueDate = changes.dueDate;
      audit(state, "collection.update", id, `Tarikh akhir "${collection.name}" ditukar`);
    }
    collection.updatedAt = now();
    write(state);
  },

  async setCollectionStatus(id, status: CollectionStatus) {
    await wait();
    const state = clone(read());
    const collection = findCollection(state, id);
    if (status === "active" && !state.participants.some((row) => row.collectionId === id))
      throw new KelabError("COLLECTION_NO_MEMBERS");
    collection.status = status;
    collection.updatedAt = now();
    audit(state, "collection.status", id, `Status "${collection.name}" ditukar`);
    write(state);
  },

  async addParticipants(collectionId, participants) {
    await wait();
    const state = clone(read());
    const collection = findCollection(state, collectionId);
    if (collection.status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
    validateParticipants(collection, participants);
    for (const participant of participants) {
      if (state.participants.some((row) => row.collectionId === collectionId && row.memberId === participant.memberId))
        throw new KelabError("PARTICIPANT_EXISTS");
      state.participants.push({ collectionId, ...participant });
      state.charges.push(...chargesFor(state, collection, participant));
    }
    const names = participants.map((participant) => memberName(state, participant.memberId)).join(", ");
    audit(state, "collection.participants", collectionId, `${names} ditambah ke "${collection.name}"`);
    write(state);
  },

  async setChargeAmount(chargeId, amount, reason) {
    await wait();
    const state = clone(read());
    const charge = state.charges.find((row) => row.id === chargeId);
    if (!charge) throw new KelabError("CHARGE_NOT_FOUND");
    checkAmount(amount);
    const ledger = chargeLedger(charge, indexLedger(state.payments, state.allocations, state.periods), today());
    if (amount < ledger.confirmed + ledger.pending) throw new KelabError("AMOUNT_BELOW_PAID");
    // A change after money has been received is a financial change and needs a reason.
    const hasMoney = ledger.confirmed + ledger.pending > 0;
    const why = hasMoney ? checkReason(reason) : reason?.trim() || null;
    const before = charge.amount;
    charge.amount = amount;
    const collection = findCollection(state, charge.collectionId);
    audit(
      state,
      "charge.amount",
      chargeId,
      `Amaun ${memberName(state, charge.memberId)} untuk "${collection.name}" ditukar dari ${formatMoney(before)} ke ${formatMoney(amount)}`,
      why,
    );
    write(state);
  },

  async setChargeExempt(chargeId, exempt, reason) {
    await wait();
    const state = clone(read());
    const charge = state.charges.find((row) => row.id === chargeId);
    if (!charge) throw new KelabError("CHARGE_NOT_FOUND");
    const why = checkReason(reason);
    const ledger = chargeLedger(charge, indexLedger(state.payments, state.allocations, state.periods), today());
    if (exempt && ledger.confirmed + ledger.pending > 0) throw new KelabError("AMOUNT_BELOW_PAID");
    charge.exempt = exempt;
    charge.exemptReason = exempt ? why : null;
    const collection = findCollection(state, charge.collectionId);
    audit(
      state,
      "charge.exempt",
      chargeId,
      `${memberName(state, charge.memberId)} ${exempt ? "dikecualikan daripada" : "tidak lagi dikecualikan daripada"} "${collection.name}"`,
      why,
    );
    write(state);
  },

  async recordPayment(input: PaymentInput) {
    await wait();
    const state = clone(read());
    const existing = state.payments.find((payment) => payment.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.id;
    if (!state.members.some((member) => member.id === input.memberId)) throw new KelabError("MEMBER_NOT_FOUND");
    if (!input.allocations.length) throw new KelabError("PAYMENT_EMPTY");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) throw new KelabError("DATE_INVALID");
    if (input.paidOn > today()) throw new KelabError("DATE_IN_FUTURE");
    const index = indexLedger(state.payments, state.allocations, state.periods);
    let total = 0;
    for (const allocation of input.allocations) {
      checkAmount(allocation.amount);
      const charge = state.charges.find((row) => row.id === allocation.chargeId);
      if (!charge || charge.memberId !== input.memberId) throw new KelabError("CHARGE_NOT_FOUND");
      if (charge.exempt) throw new KelabError("CHARGE_EXEMPT");
      if (findCollection(state, charge.collectionId).status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
      const ledger = chargeLedger(charge, index, today());
      if (allocation.amount > ledger.payable) throw new KelabError("OVERPAYMENT");
      total += allocation.amount;
    }
    checkAmount(total);
    const id = uid("p");
    const at = now();
    state.payments.push({
      id,
      idempotencyKey: input.idempotencyKey,
      memberId: input.memberId,
      collectionId: null,
      amount: total,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      state: input.confirmed ? "confirmed" : "pending",
      createdAt: at,
      confirmedAt: input.confirmed ? at : null,
      reversedAt: null,
      reversalReason: null,
    });
    input.allocations.forEach((allocation, i) =>
      state.allocations.push({ id: `${id}-${i}`, paymentId: id, chargeId: allocation.chargeId, amount: allocation.amount }),
    );
    audit(
      state,
      "payment.record",
      id,
      `Bayaran ${formatMoney(total)} daripada ${memberName(state, input.memberId)} direkod${input.confirmed ? "" : " (menunggu semakan)"}`,
    );
    write(state);
    return id;
  },

  async recordContribution(input: ContributionInput) {
    await wait();
    const state = clone(read());
    const existing = state.payments.find((payment) => payment.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.id;
    const collection = findCollection(state, input.collectionId);
    if (collection.type !== "voluntary") throw new KelabError("CHARGE_NOT_FOUND");
    if (collection.status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
    if (input.paidOn > today()) throw new KelabError("DATE_IN_FUTURE");
    checkAmount(input.amount);
    const id = uid("p");
    const at = now();
    state.payments.push({
      id,
      idempotencyKey: input.idempotencyKey,
      memberId: input.memberId,
      collectionId: collection.id,
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      state: input.confirmed ? "confirmed" : "pending",
      createdAt: at,
      confirmedAt: input.confirmed ? at : null,
      reversedAt: null,
      reversalReason: null,
    });
    audit(state, "payment.record", id, `Sumbangan ${formatMoney(input.amount)} daripada ${memberName(state, input.memberId)} direkod`);
    write(state);
    return id;
  },

  async confirmPayment(paymentId) {
    await wait();
    const state = clone(read());
    const payment = state.payments.find((row) => row.id === paymentId);
    if (!payment) throw new KelabError("PAYMENT_NOT_FOUND");
    if (payment.state !== "pending") throw new KelabError("PAYMENT_NOT_PENDING");
    payment.state = "confirmed";
    payment.confirmedAt = now();
    audit(state, "payment.confirm", paymentId, `Penerimaan ${formatMoney(payment.amount)} daripada ${memberName(state, payment.memberId)} disahkan`);
    write(state);
  },

  async reversePayment(paymentId, reason) {
    await wait();
    const state = clone(read());
    const payment = state.payments.find((row) => row.id === paymentId);
    if (!payment) throw new KelabError("PAYMENT_NOT_FOUND");
    if (payment.state === "reversed") throw new KelabError("PAYMENT_ALREADY_REVERSED");
    const why = checkReason(reason);
    payment.state = "reversed";
    payment.reversedAt = now();
    payment.reversalReason = why;
    audit(state, "payment.reverse", paymentId, `Bayaran ${formatMoney(payment.amount)} daripada ${memberName(state, payment.memberId)} dibatalkan`, why);
    write(state);
  },

  async updateClub(changes: ClubChanges) {
    await wait();
    const state = clone(read());
    if (changes.name !== undefined) state.club.name = cleanName(changes.name);
    if (changes.session !== undefined) state.club.session = changes.session.trim() || state.club.session;
    if (changes.school !== undefined) state.club.school = changes.school?.trim() || null;
    if (changes.treasurerName !== undefined) state.club.treasurerName = cleanName(changes.treasurerName);
    audit(state, "club.update", state.club.id, "Tetapan kelab dikemas kini");
    write(state);
  },

  async resetDemo() {
    await wait();
    memory = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: read() reseeds in memory.
    }
    read();
  },
};
