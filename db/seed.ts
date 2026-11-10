// Writes the Phase 1 demo dataset (lib/backend/seed.ts) into one demo club on Neon.
// Idempotent: deletes and re-creates only the demo club's rows. Refuses to run unless
// KELABKIT_DB_ENV=dev, so a production connection string in the environment is inert.
//
//   npm run db:seed

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildSeed } from "../lib/backend/seed";
import { createDb, createPool, schema } from "./client";

export const DEMO_CLUB_NAME = "KGK SK Taman Melati (demo)";

/** Today in Malaysia time as YYYY-MM-DD. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
/** "2026-03" -> "2026-03-01" (months are stored as the first of the month). */
const monthStart = (month: string | null) => (month ? `${month}-01` : null);

export async function seedDemo(env = process.env) {
  if (env.KELABKIT_DB_ENV !== "dev") {
    throw new Error("Refusing to seed: set KELABKIT_DB_ENV=dev, and only against a non-default (dev) database branch.");
  }
  const snapshot = buildSeed(today());

  // Demo ids ("m-01", "ch-baju-m-07") become fresh uuids, consistently across tables.
  const ids = new Map<string, string>();
  const uid = (old: string) => {
    let value = ids.get(old);
    if (!value) ids.set(old, (value = randomUUID()));
    return value;
  };

  const pool = createPool();
  const db = createDb(pool);
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx.select({ id: schema.clubs.id }).from(schema.clubs).where(eq(schema.clubs.name, DEMO_CLUB_NAME));
      for (const { id } of existing) {
        // Children first; nothing here is shared with another club.
        for (const table of [
          schema.auditLogs,
          schema.attachments,
          schema.paymentAllocations,
          schema.payments,
          schema.charges,
          schema.participants,
          schema.collectionPeriods,
          schema.collections,
          schema.members,
          schema.clubSettings,
          schema.clubMembers,
        ]) {
          await tx.delete(table).where(eq(table.clubId, id));
        }
        await tx.delete(schema.clubs).where(eq(schema.clubs.id, id));
      }

      const clubId = uid(snapshot.club.id);
      await tx.insert(schema.clubs).values({
        id: clubId,
        name: DEMO_CLUB_NAME,
        session: snapshot.club.session,
        school: snapshot.club.school,
        treasurerName: snapshot.club.treasurerName,
        createdAt: snapshot.club.createdAt,
      });
      await tx.insert(schema.clubSettings).values({ clubId });
      await tx.insert(schema.members).values(
        snapshot.members.map((m) => ({
          id: uid(m.id),
          clubId,
          name: m.name,
          category: m.category,
          phone: m.phone,
          notes: m.notes,
          active: m.active,
          joinedOn: m.joinedOn,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
      );
      await tx.insert(schema.collections).values(
        snapshot.collections.map((c) => ({
          id: uid(c.id),
          clubId,
          name: c.name,
          type: c.type,
          status: c.status,
          icon: c.icon,
          description: c.description,
          notes: c.notes,
          defaultAmount: c.defaultAmount,
          dueDate: c.dueDate,
          startMonth: monthStart(c.startMonth),
          endMonth: monthStart(c.endMonth),
          dueDay: c.dueDay,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      );
      if (snapshot.periods.length)
        await tx.insert(schema.collectionPeriods).values(
          snapshot.periods.map((p) => ({
            id: uid(p.id),
            clubId,
            collectionId: uid(p.collectionId),
            month: `${p.month}-01`,
            dueDate: p.dueDate,
          })),
        );
      await tx.insert(schema.participants).values(
        snapshot.participants.map((p) => ({
          clubId,
          collectionId: uid(p.collectionId),
          memberId: uid(p.memberId),
          amountOverride: p.amountOverride,
          exempt: p.exempt,
          note: p.note,
        })),
      );
      await tx.insert(schema.charges).values(
        snapshot.charges.map((c) => ({
          id: uid(c.id),
          clubId,
          collectionId: uid(c.collectionId),
          periodId: c.periodId ? uid(c.periodId) : null,
          memberId: uid(c.memberId),
          amount: c.amount,
          exempt: c.exempt,
          exemptReason: c.exemptReason,
          dueDate: c.dueDate,
          note: c.note,
        })),
      );
      await tx.insert(schema.payments).values(
        snapshot.payments.map((p) => ({
          id: uid(p.id),
          clubId,
          idempotencyKey: p.idempotencyKey,
          memberId: uid(p.memberId),
          collectionId: p.collectionId ? uid(p.collectionId) : null,
          amount: p.amount,
          method: p.method,
          paidOn: p.paidOn,
          reference: p.reference,
          note: p.note,
          state: p.state,
          createdAt: p.createdAt,
          confirmedAt: p.confirmedAt,
          reversedAt: p.reversedAt,
          reversalReason: p.reversalReason,
        })),
      );
      await tx.insert(schema.paymentAllocations).values(
        snapshot.allocations.map((a) => ({
          id: uid(a.id),
          clubId,
          paymentId: uid(a.paymentId),
          chargeId: uid(a.chargeId),
          amount: a.amount,
        })),
      );
      await tx.insert(schema.auditLogs).values(
        snapshot.audit.map((a) => ({
          clubId,
          at: a.at,
          actorLabel: a.actor,
          action: a.action,
          entityId: ids.has(a.entityId) ? uid(a.entityId) : null,
          summary: a.summary,
          reason: a.reason,
        })),
      );
      return {
        clubId,
        members: snapshot.members.length,
        collections: snapshot.collections.length,
        charges: snapshot.charges.length,
        payments: snapshot.payments.length,
        allocations: snapshot.allocations.length,
        audit: snapshot.audit.length,
      };
    });
  } finally {
    await pool.end();
  }
}

seedDemo()
  .then((counts) => console.log("seeded demo club", counts))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
