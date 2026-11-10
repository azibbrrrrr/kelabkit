import type { ChargeStatus } from "@/lib/money/ledger";
import type { AuditAction, CollectionStatus, CollectionType, MemberCategory, PaymentMethod, PaymentState } from "@/lib/types";

/**
 * Status tones are semantic and fixed: they do not follow the accent theme, so "paid"
 * is green and "overdue" is red whichever theme the treasurer picks.
 */
export type Tone = "paid" | "partial" | "unpaid" | "overdue" | "exempt" | "na" | "pending" | "future" | "neutral" | "brand";

/** The status a matrix cell or table row shows. */
export type CellStatus = ChargeStatus | "na" | "future";

export const cellStatusLabels: Record<CellStatus, [string, Tone]> = {
  paid: ["Dibayar", "paid"],
  partial: ["Sebahagian", "partial"],
  unpaid: ["Belum Bayar", "unpaid"],
  exempt: ["Dikecualikan", "exempt"],
  na: ["Tidak Berkaitan", "na"],
  future: ["Akan Datang", "future"],
};

export const overdueLabel: [string, Tone] = ["Lewat", "overdue"];
export const pendingLabel: [string, Tone] = ["Menunggu Semakan", "pending"];

export const collectionTypeLabels: Record<CollectionType, string> = {
  one_off: "Sekali bayar",
  monthly: "Bulanan",
  voluntary: "Sumbangan sukarela",
};

export const collectionStatusLabels: Record<CollectionStatus, [string, Tone]> = {
  draft: ["Draf", "neutral"],
  active: ["Aktif", "brand"],
  completed: ["Selesai", "paid"],
  archived: ["Diarkib", "na"],
};

export const categoryLabels: Record<MemberCategory, string> = {
  guru: "Guru",
  kakitangan: "Kakitangan",
  lain: "Lain-lain",
};

export const methodLabels: Record<PaymentMethod, string> = {
  cash: "Tunai",
  transfer: "Pindahan bank",
  other: "Lain-lain",
};

export const paymentStateLabels: Record<PaymentState, [string, Tone]> = {
  pending: ["Menunggu Semakan", "pending"],
  confirmed: ["Disahkan", "paid"],
  reversed: ["Dibatalkan", "na"],
};

export const auditActionLabels: Record<AuditAction, string> = {
  "member.create": "Ahli ditambah",
  "member.update": "Ahli dikemas kini",
  "member.deactivate": "Ahli dinyahaktifkan",
  "member.reactivate": "Ahli diaktifkan semula",
  "collection.create": "Kutipan dicipta",
  "collection.rename": "Kutipan dinamakan semula",
  "collection.icon": "Ikon kutipan ditukar",
  "collection.update": "Kutipan dikemas kini",
  "collection.status": "Status kutipan ditukar",
  "collection.participants": "Peserta kutipan dikemas kini",
  "charge.amount": "Amaun caj ditukar",
  "charge.exempt": "Pengecualian ditukar",
  "payment.record": "Bayaran direkod",
  "payment.confirm": "Bayaran disahkan",
  "payment.reverse": "Bayaran dibatalkan",
  "club.update": "Tetapan kelab dikemas kini",
};
