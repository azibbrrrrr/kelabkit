import type {
  CollectionStatus,
  CollectionType,
  Day,
  MemberCategory,
  Month,
  PaymentMethod,
  Sen,
  Snapshot,
} from "@/lib/types";

export type NewMember = {
  name: string;
  category: MemberCategory | null;
  phone: string | null;
  notes: string | null;
  /** Save even when a member with a similar name exists. */
  allowDuplicate?: boolean;
};
export type MemberChanges = Partial<Omit<NewMember, "allowDuplicate">>;

export type NewParticipant = {
  memberId: string;
  /** Null uses the collection's default amount. */
  amountOverride: Sen | null;
  exempt: boolean;
  note: string | null;
};

export type NewCollection = {
  name: string;
  type: CollectionType;
  defaultAmount: Sen | null;
  description: string | null;
  notes: string | null;
  dueDate: Day | null;
  startMonth: Month | null;
  endMonth: Month | null;
  dueDay: number | null;
  participants: NewParticipant[];
  /** False saves a draft. */
  activate: boolean;
};

export type CollectionChanges = {
  name?: string;
  description?: string | null;
  notes?: string | null;
  dueDate?: Day | null;
};

export type ClubChanges = { name?: string; session?: string; school?: string | null; treasurerName?: string };

type PaymentCommon = {
  /** Generated once per form; a retry with the same key returns the first result. */
  idempotencyKey: string;
  memberId: string;
  method: PaymentMethod;
  paidOn: Day;
  reference: string | null;
  note: string | null;
  /** False records it as "Menunggu Semakan" until the treasurer confirms receipt. */
  confirmed: boolean;
};

export type PaymentInput = PaymentCommon & { allocations: { chargeId: string; amount: Sen }[] };
export type ContributionInput = PaymentCommon & { collectionId: string; amount: Sen };

/**
 * Storage for KelabKit. `demo` keeps sample data in this browser; `neon` (Phase 2) will
 * run each method as one database transaction that checks club access, validates,
 * writes its audit row and honours the idempotency key. Both follow the same rules.
 */
export interface KelabBackend {
  kind: "demo" | "neon";
  load(): Promise<Snapshot>;
  addMembers(members: NewMember[]): Promise<string[]>;
  updateMember(id: string, changes: MemberChanges): Promise<void>;
  setMemberActive(id: string, active: boolean): Promise<void>;
  createCollection(input: NewCollection): Promise<string>;
  updateCollection(id: string, changes: CollectionChanges): Promise<void>;
  setCollectionStatus(id: string, status: CollectionStatus): Promise<void>;
  /** Adds members to a collection and creates their charges. */
  addParticipants(collectionId: string, participants: NewParticipant[]): Promise<void>;
  /** Changes what one member owes. Refused below what they have already paid. */
  setChargeAmount(chargeId: string, amount: Sen, reason: string | null): Promise<void>;
  setChargeExempt(chargeId: string, exempt: boolean, reason: string): Promise<void>;
  recordPayment(input: PaymentInput): Promise<string>;
  recordContribution(input: ContributionInput): Promise<string>;
  confirmPayment(paymentId: string): Promise<void>;
  /** Keeps the payment and marks it reversed with a reason; never deletes. */
  reversePayment(paymentId: string, reason: string): Promise<void>;
  updateClub(changes: ClubChanges): Promise<void>;
  resetDemo(): Promise<void>;
}
