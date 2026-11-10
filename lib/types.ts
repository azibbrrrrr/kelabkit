// Domain types for KelabKit. Shapes follow the normalised model planned for Neon in
// Phase 2: the matrix is a view over these rows, never a table with dynamic columns.
// Money is integer sen everywhere. Calendar days are `YYYY-MM-DD` in Malaysia time;
// months are `YYYY-MM`; instants are ISO strings.

export type Sen = number;
export type Day = string;
export type Month = string;

export type Club = {
  id: string;
  name: string;
  /** Free text, e.g. "2026". */
  session: string;
  school: string | null;
  treasurerName: string;
  createdAt: string;
};

export type MemberCategory = "guru" | "kakitangan" | "lain";

export type Member = {
  id: string;
  name: string;
  category: MemberCategory | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  joinedOn: Day;
  createdAt: string;
  updatedAt: string;
};

export type CollectionType = "one_off" | "monthly" | "voluntary";
export type CollectionStatus = "draft" | "active" | "completed" | "archived";

export type Collection = {
  id: string;
  name: string;
  type: CollectionType;
  status: CollectionStatus;
  /** Default amount per member (one-off) or per month (monthly). Null for voluntary. */
  defaultAmount: Sen | null;
  description: string | null;
  notes: string | null;
  /** One-off only. */
  dueDate: Day | null;
  /** Monthly only. */
  startMonth: Month | null;
  endMonth: Month | null;
  /** Monthly only: day of the month the period is due, clamped to the month's last day. */
  dueDay: number | null;
  /**
   * What tells collections apart at a glance: one emoji ("🍽️"), "lucide:<name>" from the
   * allowlist in lib/collection-icon.ts, or null for the collection type's icon. Snapshots
   * saved before this field existed have no key; readers treat that as null.
   */
  icon: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One month of a monthly collection. One-off and voluntary collections have none. */
export type CollectionPeriod = {
  id: string;
  collectionId: string;
  month: Month;
  dueDate: Day | null;
};

/** A member included in a collection, with their own amount if it differs. */
export type Participant = {
  collectionId: string;
  memberId: string;
  /** Null means "use the collection's default". */
  amountOverride: Sen | null;
  exempt: boolean;
  note: string | null;
};

/** What one member owes for one collection, or one month of it. */
export type Charge = {
  id: string;
  collectionId: string;
  periodId: string | null;
  memberId: string;
  amount: Sen;
  exempt: boolean;
  exemptReason: string | null;
  dueDate: Day | null;
  note: string | null;
};

export type PaymentMethod = "cash" | "transfer" | "other";
export type PaymentState = "pending" | "confirmed" | "reversed";

/** Money actually handed over. Never edited to change a balance; reversed instead. */
export type Payment = {
  id: string;
  idempotencyKey: string;
  memberId: string;
  /** Set for voluntary contributions, which have no charge to allocate to. */
  collectionId: string | null;
  amount: Sen;
  method: PaymentMethod;
  paidOn: Day;
  reference: string | null;
  note: string | null;
  state: PaymentState;
  createdAt: string;
  confirmedAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

/** The part of a payment that settles one charge. */
export type Allocation = {
  id: string;
  paymentId: string;
  chargeId: string;
  amount: Sen;
};

/**
 * Proof of payment (bank transfer screenshot, receipt photo, PDF). Only metadata lives in
 * the snapshot; the bytes are stored separately (IndexedDB in the demo, private object
 * storage in Phase 2). Removing keeps the row with `removedAt` and a reason; the bytes go.
 */
export type Attachment = {
  id: string;
  paymentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Hex SHA-256 of the stored bytes; refuses the same file twice on one payment. */
  sha256: string;
  createdAt: string;
  removedAt: string | null;
  removedReason: string | null;
};

export type AuditAction =
  | "member.create"
  | "member.update"
  | "member.deactivate"
  | "member.reactivate"
  | "collection.create"
  | "collection.rename"
  | "collection.icon"
  | "collection.update"
  | "collection.status"
  | "collection.participants"
  | "charge.amount"
  | "charge.exempt"
  | "payment.record"
  | "payment.confirm"
  | "payment.reverse"
  | "attachment.add"
  | "attachment.remove"
  | "club.update";

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  /** Plain-language summary in Bahasa Melayu. */
  summary: string;
  entityId: string;
  reason: string | null;
};

export type Snapshot = {
  club: Club;
  members: Member[];
  collections: Collection[];
  periods: CollectionPeriod[];
  participants: Participant[];
  charges: Charge[];
  payments: Payment[];
  allocations: Allocation[];
  /** Snapshots saved before attachments existed have no key; `upgradeSnapshot` fills []. */
  attachments: Attachment[];
  audit: AuditEntry[];
};
