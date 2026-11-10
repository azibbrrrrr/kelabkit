// Ramai: one charge (a collection, or one month of it), many members, one payment row each. Pure
// planning over the read model so the rules are testable without React. Same rules as the single
// form: only what is still payable can be paid (pending money already reserves its share), an amount
// is positive and never above that, a future month is not offered, an exempt charge is never listed.

import { errorMessages } from "@/lib/errors";
import { parseRinggit } from "@/lib/money/amount";
import type { Collection, Member, Sen, Snapshot } from "@/lib/types";
import { collectionPeriodLabel, type View } from "@/lib/view";

export type BulkRow = { member: Member; chargeId: string; payable: Sen; remaining: Sen };
export type BulkTarget = {
  key: string;
  label: string;
  collection: Collection;
  rows: BulkRow[];
  /** Members who still owe on this charge but whose remaining balance is already covered by a payment awaiting review. */
  awaitingReview: number;
};

const open = (collection: Collection | undefined): collection is Collection =>
  Boolean(collection && (collection.status === "active" || collection.status === "completed") && collection.type !== "voluntary");

/** Charges worth bulk-recording: due now (not a future month), not exempt, still payable by someone. Earliest due first. */
export function bulkTargets(data: Snapshot, view: View): BulkTarget[] {
  const periods = new Map(data.periods.map((period) => [period.id, period]));
  const byKey = new Map<string, BulkTarget & { due: string }>();
  for (const charge of data.charges) {
    const ledger = view.ledgers.get(charge.id);
    const collection = view.collectionsById.get(charge.collectionId);
    const member = view.membersById.get(charge.memberId);
    if (!ledger || !member || !open(collection) || charge.exempt || ledger.future || ledger.remaining <= 0) continue;
    const period = charge.periodId ? periods.get(charge.periodId) ?? null : null;
    const key = `${charge.collectionId}|${charge.periodId ?? ""}`;
    const entry =
      byKey.get(key) ??
      { key, label: collectionPeriodLabel(collection, period), collection, rows: [], awaitingReview: 0, due: charge.dueDate ?? (period ? `${period.month}-31` : "9999-12-31") };
    if (ledger.payable > 0) entry.rows.push({ member, chargeId: charge.id, payable: ledger.payable, remaining: ledger.remaining });
    else entry.awaitingReview += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .filter((target) => target.rows.length > 0)
    .sort((a, b) => a.due.localeCompare(b.due) || a.collection.createdAt.localeCompare(b.collection.createdAt) || a.label.localeCompare(b.label, "ms"))
    .map(({ due: _due, ...target }) => {
      target.rows.sort((a, b) => Number(b.member.active) - Number(a.member.active) || a.member.name.localeCompare(b.member.name, "ms"));
      return target;
    });
}

export type BulkPlan = {
  lines: { memberId: string; chargeId: string; amount: Sen }[];
  /** Error text per member id, for the row it belongs to. */
  errors: Record<string, string>;
  total: Sen;
};

/**
 * One line per ticked member. A blank amount means "in full" (the payable balance); a typed one is a
 * part payment. `messages` carries the localised texts so this stays free of React.
 */
export function planBulk(
  rows: BulkRow[],
  selected: ReadonlySet<string>,
  inputs: Record<string, string>,
  messages: { exceeds: (payable: Sen) => string; zero: string },
): BulkPlan {
  const lines: BulkPlan["lines"] = [];
  const errors: Record<string, string> = {};
  for (const row of rows) {
    const id = row.member.id;
    if (!selected.has(id)) continue;
    const raw = inputs[id] ?? "";
    if (!raw.trim()) {
      lines.push({ memberId: id, chargeId: row.chargeId, amount: row.payable });
      continue;
    }
    const parsed = parseRinggit(raw);
    if (!parsed.ok) errors[id] = errorMessages[parsed.error];
    else if (parsed.sen <= 0) errors[id] = messages.zero;
    else if (parsed.sen > row.payable) errors[id] = messages.exceeds(row.payable);
    else lines.push({ memberId: id, chargeId: row.chargeId, amount: parsed.sen });
  }
  return { lines, errors, total: lines.reduce((total, line) => total + line.amount, 0) };
}
