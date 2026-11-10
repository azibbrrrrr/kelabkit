import "server-only";

// The Neon implementation of every KelabBackend operation, as plain functions of
// (context, input). Server actions (app/actions/*) resolve the context from the session and
// call these; integration tests call them directly with a seeded user.
//
// Rules that touch money live in the kk_* SQL functions (migration 0002/0003). What lives
// here is input validation shared with the demo backend (lib/backend/rules.ts), writes to
// rows the app role may still change directly (members, collections, clubs), and the audit
// row for those, written through kk_audit so the actor is always the session user.

import { randomUUID } from "node:crypto";

import type {
  ClubChanges,
  CollectionChanges,
  ContributionInput,
  MemberChanges,
  NewCollection,
  NewMember,
  NewParticipant,
  PaymentInput,
} from "@/lib/backend/types";
import { attachmentKey, checkProofFile, isUuid, MAX_ACTIVE_ATTACHMENTS, type ProofCandidate } from "@/lib/attachments";
import { checkAmount, checkReason, cleanName } from "@/lib/backend/rules";
import { checkCollectionIcon, describeIcon } from "@/lib/collection-icon";
import { withClub, withUser, type Tx } from "@/lib/db/with-club";
import { KelabError } from "@/lib/errors";
import { today } from "@/lib/format";
import { dueDateFor, isMonth, monthsBetween } from "@/lib/money/months";
import { normaliseName } from "@/lib/names";
import { deleteObject, headObject, presignDownload, presignUpload } from "@/lib/server/storage";
import { loadSnapshot } from "@/lib/server/snapshot";
import type { AuditAction, CollectionStatus, Sen, Snapshot } from "@/lib/types";

export type Ctx = {
  userId: string;
  clubId: string;
  userName: string;
  /** True when the club came from the kk_club cookie and has not been checked against the database yet. */
  fromCookie?: boolean;
  /** Set by actMutation: the operation's transaction ends by reading the snapshot, which lands here. */
  collect?: { snapshot?: Snapshot };
};
export type ClubSummary = { id: string; name: string; session: string; school: string | null; treasurerName: string | null; role: "owner" | "committee" };

// ---- clubs -------------------------------------------------------------------------------

export async function listClubs(userId: string): Promise<ClubSummary[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query("select id, name, session, school, treasurer_name, role from kk_my_clubs()");
    return rows.map((r) => ({ id: r.id, name: r.name, session: r.session, school: r.school, treasurerName: r.treasurer_name, role: r.role }));
  }, { label: "my_clubs" });
}

export async function createClub(
  userId: string,
  input: { name: string; session: string; school: string | null; treasurerName: string | null },
): Promise<string> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query("select kk_create_club($1, $2, $3, $4) as id", [input.name, input.session, input.school, input.treasurerName]);
    return rows[0].id as string;
  });
}

// ---- helpers -----------------------------------------------------------------------------

/**
 * One transaction for a change. When the caller wants the result back (ctx.collect), the same
 * transaction ends by reading the snapshot, so the browser needs no second request. A failure to
 * read never undoes the change: the client just refetches.
 */
const db = <T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>, label = "change") =>
  withClub(
    ctx.userId,
    ctx.clubId,
    async (tx) => {
      const value = await fn(tx);
      if (ctx.collect) {
        try {
          ctx.collect.snapshot = await loadSnapshot(tx, ctx.userName);
        } catch {
          ctx.collect.snapshot = undefined;
        }
      }
      return value;
    },
    { label },
  );

async function audit(tx: Tx, ctx: Ctx, action: AuditAction, entityId: string, summary: string, reason: string | null = null) {
  await tx.query("select kk_audit($1::uuid, null::uuid, $2, $3::uuid, $4, $5)", [ctx.clubId, action, entityId, summary, reason]);
}

const nameOf = async (tx: Tx, id: string) => ((await tx.query("select name from members where id = $1", [id])).rows[0]?.name as string | undefined) ?? "Ahli";

async function getCollection(tx: Tx, id: string) {
  const { rows } = await tx.query("select id, name, type, status, icon, due_date::text as due_date from collections where id = $1 for update", [id]);
  if (!rows[0]) throw new KelabError("COLLECTION_NOT_FOUND");
  return rows[0] as { id: string; name: string; type: string; status: CollectionStatus; icon: string | null; due_date: string | null };
}

const participantJson = (list: NewParticipant[]) =>
  JSON.stringify(list.map((p) => ({ member_id: p.memberId, amount_override: p.amountOverride, exempt: p.exempt, note: p.note })));

// ---- reads -------------------------------------------------------------------------------

export function load(ctx: Ctx): Promise<Snapshot> {
  return withClub(ctx.userId, ctx.clubId, (tx) => loadSnapshot(tx, ctx.userName), { readOnlySnapshot: true, label: "load" });
}

// ---- members -----------------------------------------------------------------------------

export function addMembers(ctx: Ctx, input: NewMember[]): Promise<string[]> {
  return db(ctx, async (tx) => {
    const seen = new Set((await tx.query("select name from members")).rows.map((r) => normaliseName(r.name)));
    const ids: string[] = [];
    for (const row of input) {
      const name = cleanName(row.name);
      const key = normaliseName(name);
      if (seen.has(key) && !row.allowDuplicate) throw new KelabError("MEMBER_DUPLICATE", name);
      seen.add(key);
      const { rows } = await tx.query(
        "insert into members (club_id, name, category, phone, notes, joined_on) values ($1, $2, $3, $4, $5, $6::date) returning id",
        [ctx.clubId, name, row.category, row.phone?.trim() || null, row.notes?.trim() || null, today()],
      );
      ids.push(rows[0].id);
      await audit(tx, ctx, "member.create", rows[0].id, `${name} ditambah sebagai ahli`);
    }
    return ids;
  });
}

export function updateMember(ctx: Ctx, id: string, changes: MemberChanges): Promise<void> {
  return db(ctx, async (tx) => {
    const { rows } = await tx.query("select name, category, phone, notes from members where id = $1 for update", [id]);
    const member = rows[0];
    if (!member) throw new KelabError("MEMBER_NOT_FOUND");
    let name = member.name as string;
    if (changes.name !== undefined) {
      name = cleanName(changes.name);
      const others = (await tx.query("select name from members where id <> $1", [id])).rows;
      if (others.some((r) => normaliseName(r.name) === normaliseName(name))) throw new KelabError("MEMBER_DUPLICATE", name);
    }
    await tx.query("update members set name = $2, category = $3, phone = $4, notes = $5, updated_at = now() where id = $1", [
      id,
      name,
      changes.category !== undefined ? changes.category : member.category,
      changes.phone !== undefined ? changes.phone?.trim() || null : member.phone,
      changes.notes !== undefined ? changes.notes?.trim() || null : member.notes,
    ]);
    await audit(tx, ctx, "member.update", id, `Maklumat ${name} dikemas kini`);
  });
}

export function setMemberActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  return db(ctx, async (tx) => {
    const { rows } = await tx.query("update members set active = $2, updated_at = now() where id = $1 returning name", [id, active]);
    if (!rows[0]) throw new KelabError("MEMBER_NOT_FOUND");
    await audit(
      tx,
      ctx,
      active ? "member.reactivate" : "member.deactivate",
      id,
      `${rows[0].name} ${active ? "diaktifkan semula" : "dinyahaktifkan"}; rekod bayaran dikekalkan`,
    );
  });
}

// ---- collections -------------------------------------------------------------------------

export function createCollection(ctx: Ctx, input: NewCollection): Promise<string> {
  return db(ctx, async (tx) => {
    const name = cleanName(input.name);
    const existing = (await tx.query("select name from collections where status <> 'archived'")).rows;
    if (existing.some((r) => normaliseName(r.name) === normaliseName(name))) throw new KelabError("COLLECTION_DUPLICATE");
    if (input.type !== "voluntary") checkAmount(input.defaultAmount ?? 0);
    let periods: { month: string; due_date: string | null }[] = [];
    if (input.type === "monthly") {
      if (!input.startMonth || !input.endMonth || !isMonth(input.startMonth) || !isMonth(input.endMonth)) throw new KelabError("MONTH_RANGE_INVALID");
      const months = monthsBetween(input.startMonth, input.endMonth);
      if (!months.length) throw new KelabError("MONTH_RANGE_INVALID");
      if (months.length > 36) throw new KelabError("MONTH_RANGE_TOO_LONG");
      if (input.dueDay !== null && (input.dueDay < 1 || input.dueDay > 31)) throw new KelabError("DUE_DAY_INVALID");
      periods = months.map((month) => ({ month: `${month}-01`, due_date: dueDateFor(month, input.dueDay) }));
    }
    if (input.activate && !input.participants.length) throw new KelabError("COLLECTION_NO_MEMBERS");
    const icon = checkCollectionIcon(input.icon);
    const collection = {
      name,
      type: input.type,
      activate: input.activate,
      icon,
      description: input.description,
      notes: input.notes,
      default_amount: input.type === "voluntary" ? null : input.defaultAmount,
      due_date: input.type === "one_off" ? input.dueDate : null,
      start_month: input.type === "monthly" ? `${input.startMonth}-01` : null,
      end_month: input.type === "monthly" ? `${input.endMonth}-01` : null,
      due_day: input.type === "monthly" ? input.dueDay : null,
    };
    const { rows } = await tx.query("select kk_create_collection($1, $2::jsonb, $3::jsonb, $4::jsonb) as id", [
      ctx.clubId,
      JSON.stringify(collection),
      JSON.stringify(periods),
      participantJson(input.participants),
    ]);
    return rows[0].id as string;
  });
}

export function updateCollection(ctx: Ctx, id: string, changes: CollectionChanges): Promise<void> {
  return db(ctx, async (tx) => {
    const collection = await getCollection(tx, id);
    if (collection.status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
    let name = collection.name;
    if (changes.name !== undefined) {
      name = cleanName(changes.name);
      const others = (await tx.query("select name from collections where id <> $1 and status <> 'archived'", [id])).rows;
      if (others.some((r) => normaliseName(r.name) === normaliseName(name))) throw new KelabError("COLLECTION_DUPLICATE");
      if (name !== collection.name) await audit(tx, ctx, "collection.rename", id, `"${collection.name}" dinamakan semula kepada "${name}"`);
    }
    await tx.query(
      `update collections set name = $2,
         description = case when $3::boolean then $4 else description end,
         notes = case when $5::boolean then $6 else notes end,
         updated_at = now() where id = $1`,
      [
        id,
        name,
        changes.description !== undefined,
        changes.description?.trim() || null,
        changes.notes !== undefined,
        changes.notes?.trim() || null,
      ],
    );
    if (changes.dueDate !== undefined && collection.type === "one_off") {
      await tx.query("select kk_set_collection_due_date($1, $2, $3::date)", [ctx.clubId, id, changes.dueDate]);
    }
  });
}

export function setCollectionStatus(ctx: Ctx, id: string, status: CollectionStatus): Promise<void> {
  return db(ctx, async (tx) => {
    const collection = await getCollection(tx, id);
    if (status === "active") {
      const { rows } = await tx.query("select 1 from participants where collection_id = $1 limit 1", [id]);
      if (!rows.length) throw new KelabError("COLLECTION_NO_MEMBERS");
    }
    await tx.query("update collections set status = $2, updated_at = now() where id = $1", [id, status]);
    await audit(tx, ctx, "collection.status", id, `Status "${collection.name}" ditukar`);
  });
}

export function setCollectionIcon(ctx: Ctx, id: string, input: string | null): Promise<void> {
  return db(ctx, async (tx) => {
    const collection = await getCollection(tx, id);
    if (collection.status === "archived") throw new KelabError("COLLECTION_ARCHIVED");
    const icon = checkCollectionIcon(input);
    const before = collection.icon ?? null;
    if (icon === before) return;
    await tx.query("update collections set icon = $2, updated_at = now() where id = $1", [id, icon]);
    await audit(tx, ctx, "collection.icon", id, `Ikon kutipan "${collection.name}" ditukar: ${describeIcon(before)} → ${describeIcon(icon)}`);
  });
}

export function addParticipants(ctx: Ctx, collectionId: string, participants: NewParticipant[]): Promise<void> {
  return db(ctx, async (tx) => {
    await tx.query("select kk_add_participants($1, $2, $3::jsonb)", [ctx.clubId, collectionId, participantJson(participants)]);
  });
}

// ---- charges and payments (money: kk_* functions only) ----------------------------------------

export function setChargeAmount(ctx: Ctx, chargeId: string, amount: Sen, reason: string | null): Promise<void> {
  return db(ctx, async (tx) => {
    checkAmount(amount);
    await tx.query("select kk_set_charge_amount($1, $2, $3, $4)", [ctx.clubId, chargeId, amount, reason]);
  });
}

export function setChargeExempt(ctx: Ctx, chargeId: string, exempt: boolean, reason: string): Promise<void> {
  return db(ctx, async (tx) => {
    checkReason(reason);
    await tx.query("select kk_set_charge_exempt($1, $2, $3, $4)", [ctx.clubId, chargeId, exempt, reason]);
  });
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function recordPayment(ctx: Ctx, input: PaymentInput): Promise<string> {
  return db(ctx, async (tx) => {
    if (!DAY.test(input.paidOn)) throw new KelabError("DATE_INVALID");
    if (!Array.isArray(input.allocations)) throw new KelabError("PAYMENT_EMPTY");
    const { rows } = await tx.query("select kk_record_payment($1, $2, $3, $4::payment_method, $5::date, $6, $7, $8, $9::jsonb) as id", [
      ctx.clubId,
      input.idempotencyKey,
      input.memberId,
      input.method,
      input.paidOn,
      input.reference,
      input.note,
      input.confirmed,
      JSON.stringify(input.allocations.map((a) => ({ charge_id: a.chargeId, amount: a.amount }))),
    ]);
    return rows[0].id as string;
  });
}

export function recordContribution(ctx: Ctx, input: ContributionInput): Promise<string> {
  return db(ctx, async (tx) => {
    if (!DAY.test(input.paidOn)) throw new KelabError("DATE_INVALID");
    checkAmount(input.amount);
    const { rows } = await tx.query("select kk_record_contribution($1, $2, $3, $4, $5::payment_method, $6::date, $7, $8, $9, $10) as id", [
      ctx.clubId,
      input.idempotencyKey,
      input.memberId,
      input.collectionId,
      input.method,
      input.paidOn,
      input.reference,
      input.note,
      input.confirmed,
      input.amount,
    ]);
    return rows[0].id as string;
  });
}

export function confirmPayment(ctx: Ctx, paymentId: string): Promise<void> {
  return db(ctx, async (tx) => {
    await tx.query("select kk_confirm_payment($1, $2)", [ctx.clubId, paymentId]);
  });
}

export function reversePayment(ctx: Ctx, paymentId: string, reason: string): Promise<void> {
  return db(ctx, async (tx) => {
    await tx.query("select kk_reverse_payment($1, $2, $3)", [ctx.clubId, paymentId, reason]);
  });
}

// ---- payment proof ---------------------------------------------------------------------------
// Bytes live in private object storage under attachmentKey(club, payment, attachment); the
// attachments row (written only by kk_add_attachment / kk_remove_attachment) is what makes an
// object part of the record. Upload is three steps: prepare (checks, presigned PUT), the
// browser PUTs the bytes straight to the store, confirm (HEAD the object, then the row).

export type ProofMeta = ProofCandidate & { sha256: string; attachmentId: string };
export type PreparedUpload = { attachmentId: string; mimeType: string; url: string };

/** A payment id the session's club does not own finds no row (RLS plus the club filter): FORBIDDEN, same as a stranger. */
async function paymentStateFor(tx: Tx, paymentId: string) {
  if (!isUuid(paymentId)) throw new KelabError("FORBIDDEN");
  const { rows } = await tx.query("select state from payments where id = $1", [paymentId]);
  if (!rows[0]) throw new KelabError("FORBIDDEN");
  return rows[0].state as string;
}

export async function prepareAttachmentUploads(ctx: Ctx, paymentId: string, files: ProofCandidate[]): Promise<PreparedUpload[]> {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_ACTIVE_ATTACHMENTS) throw new KelabError("ATTACHMENT_LIMIT");
  const mimes = files.map((file) => checkProofFile({ fileName: String(file?.fileName), mimeType: String(file?.mimeType), sizeBytes: Number(file?.sizeBytes) }));
  await withClub(ctx.userId, ctx.clubId, async (tx) => {
    if ((await paymentStateFor(tx, paymentId)) === "reversed") throw new KelabError("ATTACHMENT_PAYMENT_REVERSED");
    const { rows } = await tx.query("select count(*)::int as n from attachments where payment_id = $1 and removed_at is null", [paymentId]);
    if (rows[0].n + files.length > MAX_ACTIVE_ATTACHMENTS) throw new KelabError("ATTACHMENT_LIMIT");
  }, { label: "attachment_prepare" });
  return Promise.all(
    files.map(async (file, i) => {
      const attachmentId = randomUUID();
      const url = await presignUpload(attachmentKey(ctx.clubId, paymentId, attachmentId), mimes[i], file.sizeBytes);
      return { attachmentId, mimeType: mimes[i], url };
    }),
  );
}

/** Deletes objects that no attachments row owns. A recorded object is never touched, so a replayed confirm cannot destroy proof. */
async function discardUnrecorded(ctx: Ctx, keysById: Map<string, string>) {
  try {
    const recorded = await withClub(ctx.userId, ctx.clubId, async (tx) =>
      new Set((await tx.query("select id from attachments where id = any($1::uuid[])", [[...keysById.keys()]])).rows.map((r) => r.id as string)),
    { label: "attachment_discard" });
    await Promise.all([...keysById].filter(([id]) => !recorded.has(id)).map(([, key]) => deleteObject(key)));
  } catch {
    // Best effort: an unrecorded object is unreachable (nothing presigns a read for it).
  }
}

export async function confirmAttachmentUploads(ctx: Ctx, paymentId: string, items: ProofMeta[]): Promise<string[]> {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ACTIVE_ATTACHMENTS) throw new KelabError("ATTACHMENT_LIMIT");
  if (!isUuid(paymentId)) throw new KelabError("FORBIDDEN");
  const keys = new Map<string, string>();
  const checked = items.map((item) => {
    if (!isUuid(item?.attachmentId)) throw new KelabError("FORBIDDEN");
    const mime = checkProofFile({ fileName: String(item.fileName), mimeType: String(item.mimeType), sizeBytes: Number(item.sizeBytes) });
    keys.set(item.attachmentId, attachmentKey(ctx.clubId, paymentId, item.attachmentId));
    return { ...item, mime };
  });
  if (keys.size !== items.length) throw new KelabError("ATTACHMENT_DUPLICATE");
  try {
    // What is in the store is judged, not what the browser says it sent. Before the transaction,
    // so no database connection waits on the network.
    for (const item of checked) {
      const head = await headObject(keys.get(item.attachmentId)!);
      if (!head || head.sizeBytes !== item.sizeBytes || head.contentType !== item.mime) throw new KelabError("ATTACHMENT_UPLOAD_FAILED");
    }
    return await db(ctx, async (tx) => {
      const ids: string[] = [];
      for (const item of checked) {
        await tx.query("select kk_add_attachment($1, $2, $3, $4, $5, $6, $7, $8)", [
          ctx.clubId, paymentId, item.attachmentId, item.fileName, item.mime, item.sizeBytes, item.sha256, keys.get(item.attachmentId),
        ]);
        ids.push(item.attachmentId);
      }
      return ids;
    }, "attachment_add");
  } catch (error) {
    await discardUnrecorded(ctx, keys);
    throw error;
  }
}

export async function removeAttachment(ctx: Ctx, attachmentId: string, reason: string): Promise<void> {
  const why = checkReason(reason);
  if (!isUuid(attachmentId)) throw new KelabError("ATTACHMENT_NOT_FOUND");
  const key = await db(ctx, async (tx) => (await tx.query("select kk_remove_attachment($1, $2, $3) as key", [ctx.clubId, attachmentId, why])).rows[0].key as string | null, "attachment_remove");
  // After the commit: the record says "removed" first, so a failed delete leaves an unreachable
  // object, never a live record without bytes.
  if (key) await deleteObject(key).catch(() => undefined);
}

export async function attachmentDownloadUrl(ctx: Ctx, attachmentId: string): Promise<{ url: string }> {
  if (!isUuid(attachmentId)) throw new KelabError("ATTACHMENT_NOT_FOUND");
  const row = await withClub(ctx.userId, ctx.clubId, async (tx) => (await tx.query("select storage_key, mime_type, removed_at from attachments where id = $1", [attachmentId])).rows[0], { label: "attachment_url" });
  if (!row) throw new KelabError("ATTACHMENT_NOT_FOUND");
  if (row.removed_at) throw new KelabError("ATTACHMENT_ALREADY_REMOVED");
  if (!row.storage_key) throw new KelabError("ATTACHMENT_NOT_FOUND");
  return { url: await presignDownload(row.storage_key, row.mime_type) };
}

// ---- club ----------------------------------------------------------------------------------

export function updateClub(ctx: Ctx, changes: ClubChanges): Promise<void> {
  return db(ctx, async (tx) => {
    const { rows } = await tx.query("select name, session, school, treasurer_name from clubs where id = $1 for update", [ctx.clubId]);
    const club = rows[0];
    if (!club) throw new KelabError("FORBIDDEN");
    await tx.query("update clubs set name = $2, session = $3, school = $4, treasurer_name = $5, updated_at = now() where id = $1", [
      ctx.clubId,
      changes.name !== undefined ? cleanName(changes.name) : club.name,
      changes.session !== undefined ? changes.session.trim() || club.session : club.session,
      changes.school !== undefined ? changes.school?.trim() || null : club.school,
      changes.treasurerName !== undefined ? cleanName(changes.treasurerName) : club.treasurer_name,
    ]);
    await audit(tx, ctx, "club.update", ctx.clubId, "Tetapan kelab dikemas kini");
  });
}
