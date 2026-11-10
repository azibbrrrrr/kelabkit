import "server-only";

// Builds the Snapshot every screen reads from SQL, inside one transaction scoped to a club.
// Dates come back as text (`date::text`), money as numbers (sen), instants as ISO strings.

import type { Tx } from "@/lib/db/with-club";
import type { Snapshot, AuditAction, MemberCategory, CollectionType, CollectionStatus, PaymentMethod, PaymentState } from "@/lib/types";

const iso = (value: Date | string) => new Date(value).toISOString();
const isoOrNull = (value: Date | string | null) => (value ? iso(value) : null);
const num = (value: string | number | null) => (value === null ? null : Number(value));
const AUDIT_LIMIT = 1000;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadSnapshot(tx: Tx, userName: string): Promise<Snapshot> {
  const q = async (sql: string, params: unknown[] = []) => (await tx.query(sql, params)).rows as Row[];

  const [club] = await q("select id, name, session, school, treasurer_name, created_at from clubs");
  if (!club) throw new Error("club not visible");
  const members = await q("select id, name, category, phone, notes, active, joined_on::text as joined_on, created_at, updated_at from members order by name, id");
  const collections = await q(
    `select id, name, type, status, icon, description, notes, default_amount, due_date::text as due_date,
            start_month::text as start_month, end_month::text as end_month, due_day, created_at, updated_at
     from collections order by created_at, id`,
  );
  const periods = await q("select id, collection_id, month::text as month, due_date::text as due_date from collection_periods order by month, id");
  const participants = await q("select collection_id, member_id, amount_override, exempt, note from participants order by created_at, id");
  const charges = await q(
    "select id, collection_id, period_id, member_id, amount, exempt, exempt_reason, due_date::text as due_date, note from charges order by created_at, id",
  );
  const payments = await q(
    `select id, idempotency_key, member_id, collection_id, amount, method, paid_on::text as paid_on, reference, note, state,
            created_at, confirmed_at, reversed_at, reversal_reason
     from payments order by created_at, id`,
  );
  const allocations = await q("select id, payment_id, charge_id, amount from payment_allocations order by id");
  const attachments = await q(
    `select id, payment_id, file_name, mime_type, size_bytes, sha256, created_at, removed_at, removed_reason
     from attachments order by created_at, id`,
  );
  const audit = await q(
    "select id, at, actor_user_id, actor_label, action, entity_id, summary, reason from audit_logs order by at desc, id desc limit $1",
    [AUDIT_LIMIT],
  );
  // Display names are a nicety: a failure here (e.g. neon_auth unreachable) must not abort the load.
  const names = new Map<string, string>();
  await tx.query("savepoint actor_names");
  try {
    for (const r of await q("select user_id, name from kk_actor_names($1)", [club.id])) names.set(r.user_id, r.name);
    await tx.query("release savepoint actor_names");
  } catch {
    await tx.query("rollback to savepoint actor_names");
  }

  return {
    club: {
      id: club.id,
      name: club.name,
      session: club.session,
      school: club.school,
      treasurerName: club.treasurer_name ?? userName,
      createdAt: iso(club.created_at),
    },
    members: members.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as MemberCategory | null,
      phone: r.phone,
      notes: r.notes,
      active: r.active,
      joinedOn: r.joined_on,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    collections: collections.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as CollectionType,
      status: r.status as CollectionStatus,
      icon: r.icon,
      description: r.description,
      notes: r.notes,
      defaultAmount: num(r.default_amount),
      dueDate: r.due_date,
      startMonth: r.start_month ? r.start_month.slice(0, 7) : null,
      endMonth: r.end_month ? r.end_month.slice(0, 7) : null,
      dueDay: r.due_day,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    periods: periods.map((r) => ({ id: r.id, collectionId: r.collection_id, month: String(r.month).slice(0, 7), dueDate: r.due_date })),
    participants: participants.map((r) => ({
      collectionId: r.collection_id,
      memberId: r.member_id,
      amountOverride: num(r.amount_override),
      exempt: r.exempt,
      note: r.note,
    })),
    charges: charges.map((r) => ({
      id: r.id,
      collectionId: r.collection_id,
      periodId: r.period_id,
      memberId: r.member_id,
      amount: Number(r.amount),
      exempt: r.exempt,
      exemptReason: r.exempt_reason,
      dueDate: r.due_date,
      note: r.note,
    })),
    payments: payments.map((r) => ({
      id: r.id,
      idempotencyKey: r.idempotency_key,
      memberId: r.member_id,
      collectionId: r.collection_id,
      amount: Number(r.amount),
      method: r.method as PaymentMethod,
      paidOn: r.paid_on,
      reference: r.reference,
      note: r.note,
      state: r.state as PaymentState,
      createdAt: iso(r.created_at),
      confirmedAt: isoOrNull(r.confirmed_at),
      reversedAt: isoOrNull(r.reversed_at),
      reversalReason: r.reversal_reason,
    })),
    allocations: allocations.map((r) => ({ id: r.id, paymentId: r.payment_id, chargeId: r.charge_id, amount: Number(r.amount) })),
    attachments: attachments.map((r) => ({
      id: r.id,
      paymentId: r.payment_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      sha256: r.sha256,
      createdAt: iso(r.created_at),
      removedAt: isoOrNull(r.removed_at),
      removedReason: r.removed_reason,
    })),
    audit: audit.map((r) => ({
      id: r.id,
      at: iso(r.at),
      actor: r.actor_label ?? (r.actor_user_id ? (names.get(r.actor_user_id) ?? "Pengguna") : "Sistem"),
      action: r.action as AuditAction,
      summary: r.summary,
      entityId: r.entity_id ?? "",
      reason: r.reason,
    })),
  };
}
