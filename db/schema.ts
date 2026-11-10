// KelabKit Postgres schema (Neon). Money is bigint sen; calendar days are `date` in
// Malaysia time; months are the first day of the month; instants are timestamptz.
//
// Tenancy: every tenant table carries `club_id NOT NULL` with an FK and an index. Child
// rows use composite FKs (club_id, parent_id) -> parent (club_id, id), so a child can never
// point at another club's parent. Row level security (migration 0001) is the second guard
// behind the application's own club_id filters. RLS policies, functions and the
// `charge_ledger` view live in hand-written migrations, not here.
//
// `user_id` columns hold the Neon Auth (`neon_auth."user".id`, uuid) of a person. There is
// no foreign key: `neon_auth` is owned by the auth provider and these migrations must not
// depend on its tables.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const clubId = () => uuid("club_id").notNull();
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const createdAt = () => instant("created_at").notNull().defaultNow();
const sen = (name: string) => bigint(name, { mode: "number" });

export const clubRole = pgEnum("club_role", ["owner", "committee"]);
export const memberCategory = pgEnum("member_category", ["guru", "kakitangan", "lain"]);
export const collectionType = pgEnum("collection_type", ["one_off", "monthly", "voluntary"]);
export const collectionStatus = pgEnum("collection_status", ["draft", "active", "completed", "archived"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "transfer", "other"]);
export const paymentState = pgEnum("payment_state", ["pending", "confirmed", "reversed"]);

export const clubs = pgTable(
  "clubs",
  {
    id: id(),
    name: text("name").notNull(),
    session: text("session").notNull(),
    school: text("school"),
    treasurerName: text("treasurer_name"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [check("clubs_name_not_blank", sql`length(btrim(${t.name})) > 0`)],
);

export const clubMembers = pgTable(
  "club_members",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    userId: uuid("user_id").notNull(),
    role: clubRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("club_members_club_user_key").on(t.clubId, t.userId), index("club_members_club_idx").on(t.clubId), index("club_members_user_idx").on(t.userId)],
);

export const clubSettings = pgTable("club_settings", {
  clubId: clubId()
    .primaryKey()
    .references(() => clubs.id),
  /** Consent: may uploaded proof be read by an AI service. Off until a treasurer opts in. */
  aiReadingEnabled: boolean("ai_reading_enabled").notNull().default(false),
  updatedAt: instant("updated_at").notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id"),
});

export const members = pgTable(
  "members",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    name: text("name").notNull(),
    category: memberCategory("category"),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    joinedOn: date("joined_on", { mode: "string" }).notNull(),
    createdAt: createdAt(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("members_club_id_key").on(t.clubId, t.id),
    index("members_club_idx").on(t.clubId),
    check("members_name_not_blank", sql`length(btrim(${t.name})) > 0`),
  ],
);

export const collections = pgTable(
  "collections",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    name: text("name").notNull(),
    type: collectionType("type").notNull(),
    status: collectionStatus("status").notNull().default("draft"),
    /** One emoji, "lucide:<name>", or null for the type's icon. */
    icon: text("icon"),
    description: text("description"),
    notes: text("notes"),
    defaultAmount: sen("default_amount"),
    dueDate: date("due_date", { mode: "string" }),
    startMonth: date("start_month", { mode: "string" }),
    endMonth: date("end_month", { mode: "string" }),
    dueDay: smallint("due_day"),
    createdAt: createdAt(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("collections_club_id_key").on(t.clubId, t.id),
    index("collections_club_idx").on(t.clubId),
    check("collections_name_not_blank", sql`length(btrim(${t.name})) > 0`),
    check("collections_default_amount_nonneg", sql`${t.defaultAmount} is null or ${t.defaultAmount} >= 0`),
    check("collections_due_day_range", sql`${t.dueDay} is null or ${t.dueDay} between 1 and 31`),
    check("collections_start_month_first", sql`${t.startMonth} is null or extract(day from ${t.startMonth}) = 1`),
    check("collections_end_month_first", sql`${t.endMonth} is null or extract(day from ${t.endMonth}) = 1`),
    check("collections_month_order", sql`${t.startMonth} is null or ${t.endMonth} is null or ${t.endMonth} >= ${t.startMonth}`),
  ],
);

export const collectionPeriods = pgTable(
  "collection_periods",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    collectionId: uuid("collection_id").notNull(),
    month: date("month", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
  },
  (t) => [
    unique("collection_periods_club_id_key").on(t.clubId, t.id),
    unique("collection_periods_collection_month_key").on(t.collectionId, t.month),
    index("collection_periods_club_idx").on(t.clubId),
    foreignKey({ columns: [t.clubId, t.collectionId], foreignColumns: [collections.clubId, collections.id], name: "collection_periods_collection_fk" }),
    check("collection_periods_month_first", sql`extract(day from ${t.month}) = 1`),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    collectionId: uuid("collection_id").notNull(),
    memberId: uuid("member_id").notNull(),
    /** Null means "use the collection's default". */
    amountOverride: sen("amount_override"),
    exempt: boolean("exempt").notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("participants_club_collection_member_key").on(t.clubId, t.collectionId, t.memberId),
    index("participants_club_idx").on(t.clubId),
    index("participants_member_idx").on(t.memberId),
    foreignKey({ columns: [t.clubId, t.collectionId], foreignColumns: [collections.clubId, collections.id], name: "participants_collection_fk" }),
    foreignKey({ columns: [t.clubId, t.memberId], foreignColumns: [members.clubId, members.id], name: "participants_member_fk" }),
    check("participants_override_nonneg", sql`${t.amountOverride} is null or ${t.amountOverride} >= 0`),
  ],
);

export const charges = pgTable(
  "charges",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    collectionId: uuid("collection_id").notNull(),
    periodId: uuid("period_id"),
    memberId: uuid("member_id").notNull(),
    amount: sen("amount").notNull(),
    exempt: boolean("exempt").notNull().default(false),
    exemptReason: text("exempt_reason"),
    dueDate: date("due_date", { mode: "string" }),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("charges_club_id_key").on(t.clubId, t.id),
    // One charge per member, collection and month. Period is null for one-off collections,
    // so the null is folded to a fixed uuid for uniqueness.
    uniqueIndex("charges_member_collection_period_key").on(
      t.memberId,
      t.collectionId,
      sql`coalesce(${t.periodId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("charges_club_idx").on(t.clubId),
    index("charges_collection_idx").on(t.collectionId),
    foreignKey({ columns: [t.clubId, t.collectionId], foreignColumns: [collections.clubId, collections.id], name: "charges_collection_fk" }),
    // With a null period_id this FK is not checked (MATCH SIMPLE), which is what one-off charges need.
    foreignKey({ columns: [t.clubId, t.periodId], foreignColumns: [collectionPeriods.clubId, collectionPeriods.id], name: "charges_period_fk" }),
    // A charge exists only for a member who participates in that collection.
    foreignKey({
      columns: [t.clubId, t.collectionId, t.memberId],
      foreignColumns: [participants.clubId, participants.collectionId, participants.memberId],
      name: "charges_participant_fk",
    }),
    check("charges_amount_nonneg", sql`${t.amount} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    idempotencyKey: text("idempotency_key").notNull(),
    memberId: uuid("member_id").notNull(),
    /** Set for voluntary contributions, which have no charge to allocate to. */
    collectionId: uuid("collection_id"),
    amount: sen("amount").notNull(),
    method: paymentMethod("method").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    reference: text("reference"),
    note: text("note"),
    state: paymentState("state").notNull(),
    createdAt: createdAt(),
    createdByUserId: uuid("created_by_user_id"),
    confirmedAt: instant("confirmed_at"),
    reversedAt: instant("reversed_at"),
    reversalReason: text("reversal_reason"),
    reversedByUserId: uuid("reversed_by_user_id"),
  },
  (t) => [
    unique("payments_club_id_key").on(t.clubId, t.id),
    unique("payments_club_idempotency_key").on(t.clubId, t.idempotencyKey),
    index("payments_club_idx").on(t.clubId),
    index("payments_member_idx").on(t.memberId),
    foreignKey({ columns: [t.clubId, t.memberId], foreignColumns: [members.clubId, members.id], name: "payments_member_fk" }),
    foreignKey({ columns: [t.clubId, t.collectionId], foreignColumns: [collections.clubId, collections.id], name: "payments_collection_fk" }),
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check("payments_reversed_has_reason", sql`${t.state} <> 'reversed' or (${t.reversedAt} is not null and length(btrim(coalesce(${t.reversalReason}, ''))) > 0)`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    paymentId: uuid("payment_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    amount: sen("amount").notNull(),
  },
  (t) => [
    unique("payment_allocations_payment_charge_key").on(t.paymentId, t.chargeId),
    index("payment_allocations_club_idx").on(t.clubId),
    index("payment_allocations_charge_idx").on(t.chargeId),
    foreignKey({ columns: [t.clubId, t.paymentId], foreignColumns: [payments.clubId, payments.id], name: "payment_allocations_payment_fk" }),
    foreignKey({ columns: [t.clubId, t.chargeId], foreignColumns: [charges.clubId, charges.id], name: "payment_allocations_charge_fk" }),
    check("payment_allocations_amount_positive", sql`${t.amount} > 0`),
  ],
);

/** Metadata only. The file itself lives in object storage under `storage_key`. */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    paymentId: uuid("payment_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key"),
    createdAt: createdAt(),
    removedAt: instant("removed_at"),
    removedReason: text("removed_reason"),
  },
  (t) => [
    index("attachments_club_idx").on(t.clubId),
    index("attachments_payment_idx").on(t.paymentId),
    foreignKey({ columns: [t.clubId, t.paymentId], foreignColumns: [payments.clubId, payments.id], name: "attachments_payment_fk" }),
    check("attachments_size_nonneg", sql`${t.sizeBytes} >= 0`),
    check("attachments_sha256_hex", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check("attachments_removed_has_reason", sql`${t.removedAt} is null or length(btrim(coalesce(${t.removedReason}, ''))) > 0`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    clubId: clubId().references(() => clubs.id),
    at: instant("at").notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    /** Display name when there is no user id (seed data). */
    actorLabel: text("actor_label"),
    /** Matches AuditAction in lib/types.ts. */
    action: text("action").notNull(),
    entityId: uuid("entity_id"),
    /** Plain-language summary in Bahasa Melayu. */
    summary: text("summary").notNull(),
    reason: text("reason"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [index("audit_logs_club_at_idx").on(t.clubId, t.at), index("audit_logs_entity_idx").on(t.entityId)],
);

/**
 * Display preferences of one person (theme, language, matrix layout). Per user, not per club, so
 * there is no club_id. The app role has no privileges on this table: it is read and written only
 * through kk_get_prefs() / kk_save_prefs() (migration 0005), which key every row on the session user.
 */
export const userPrefs = pgTable("user_prefs", {
  userId: uuid("user_id").primaryKey(),
  prefs: jsonb("prefs").notNull().default(sql`'{}'::jsonb`),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});

// Fixed-window counters for kk_rate_hit(). One row per scope and user ("mutation:<user id>"). RLS on, no
// privilege for kelabkit_app: only the SECURITY DEFINER function touches it (migration 0006).
export const rateLimits = pgTable("rate_limits", {
  bucket: text("bucket").primaryKey(),
  windowStart: instant("window_start").notNull().defaultNow(),
  hits: integer("hits").notNull().default(0),
});
