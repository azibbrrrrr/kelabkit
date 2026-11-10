import { t, type MessageKey } from "@/lib/i18n";
import type { ChargeStatus } from "@/lib/money/ledger";
import type { AuditAction, CollectionStatus, CollectionType, MemberCategory, PaymentMethod, PaymentState } from "@/lib/types";

/**
 * Status tones are semantic and fixed: they do not follow the accent theme, so "paid"
 * is green and "overdue" is red whichever theme the treasurer picks.
 */
export type Tone = "paid" | "partial" | "unpaid" | "overdue" | "exempt" | "na" | "pending" | "future" | "neutral" | "brand";

/** The status a matrix cell or table row shows. */
export type CellStatus = ChargeStatus | "na" | "future";

/**
 * The label tables read the current locale each time an entry is accessed, so screens that
 * have not been extracted yet keep working and follow the language switch on their next render.
 */
function localised<K extends string, V>(defs: Record<K, [MessageKey, V]>): Record<K, [string, V]> {
  const out = {} as Record<K, [string, V]>;
  for (const key of Object.keys(defs) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => [t(defs[key][0]), defs[key][1]] as [string, V] });
  }
  return out;
}

function words<K extends string>(defs: Record<K, MessageKey>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(defs) as K[]) Object.defineProperty(out, key, { enumerable: true, get: () => t(defs[key]) });
  return out;
}

export const cellStatusLabels: Record<CellStatus, [string, Tone]> = localised<CellStatus, Tone>({
  paid: ["labels.status.paid", "paid"],
  partial: ["labels.status.partial", "partial"],
  unpaid: ["labels.status.unpaid", "unpaid"],
  exempt: ["labels.status.exempt", "exempt"],
  na: ["labels.status.na", "na"],
  future: ["labels.status.future", "future"],
});

/** A [label, tone] pair whose label is read from the current locale on every access. */
function livePair<V>(key: MessageKey, tone: V): [string, V] {
  return new Proxy([key, tone] as unknown as [string, V], {
    get: (target, prop, receiver) => (prop === "0" ? t(key) : Reflect.get(target, prop, receiver)),
  });
}

export const overdueLabel: [string, Tone] = livePair("labels.status.overdue", "overdue");
export const pendingLabel: [string, Tone] = livePair("labels.status.pending", "pending");

export const collectionTypeLabels: Record<CollectionType, string> = words<CollectionType>({
  one_off: "labels.collectionType.one_off",
  monthly: "labels.collectionType.monthly",
  voluntary: "labels.collectionType.voluntary",
});

export const collectionStatusLabels: Record<CollectionStatus, [string, Tone]> = localised<CollectionStatus, Tone>({
  draft: ["labels.collectionStatus.draft", "neutral"],
  active: ["labels.collectionStatus.active", "brand"],
  completed: ["labels.collectionStatus.completed", "paid"],
  archived: ["labels.collectionStatus.archived", "na"],
});

export const categoryLabels: Record<MemberCategory, string> = words<MemberCategory>({
  guru: "labels.category.guru",
  kakitangan: "labels.category.kakitangan",
  lain: "labels.category.lain",
});

export const methodLabels: Record<PaymentMethod, string> = words<PaymentMethod>({
  cash: "labels.method.cash",
  transfer: "labels.method.transfer",
  other: "labels.method.other",
});

export const paymentStateLabels: Record<PaymentState, [string, Tone]> = localised<PaymentState, Tone>({
  pending: ["labels.paymentState.pending", "pending"],
  confirmed: ["labels.paymentState.confirmed", "paid"],
  reversed: ["labels.paymentState.reversed", "na"],
});

export const auditActionLabels: Record<AuditAction, string> = words<AuditAction>({
  "member.create": "labels.audit.member_create",
  "member.update": "labels.audit.member_update",
  "member.deactivate": "labels.audit.member_deactivate",
  "member.reactivate": "labels.audit.member_reactivate",
  "collection.create": "labels.audit.collection_create",
  "collection.rename": "labels.audit.collection_rename",
  "collection.icon": "labels.audit.collection_icon",
  "collection.update": "labels.audit.collection_update",
  "collection.status": "labels.audit.collection_status",
  "collection.participants": "labels.audit.collection_participants",
  "charge.amount": "labels.audit.charge_amount",
  "charge.exempt": "labels.audit.charge_exempt",
  "payment.record": "labels.audit.payment_record",
  "payment.confirm": "labels.audit.payment_confirm",
  "payment.reverse": "labels.audit.payment_reverse",
  "attachment.add": "labels.audit.attachment_add",
  "attachment.remove": "labels.audit.attachment_remove",
  "club.update": "labels.audit.club_update",
});
