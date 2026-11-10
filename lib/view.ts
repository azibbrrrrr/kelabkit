// Read-side model built once per snapshot: ledgers per charge, totals per collection and
// member, and the matrix columns. Screens read this; nothing here writes.

import { formatMonth } from "@/lib/format";
import { chargeLedger, indexLedger, totalsOf, voluntaryReceived, type ChargeLedger, type Totals } from "@/lib/money/ledger";
import type { CellStatus } from "@/lib/labels";
import type { Charge, Collection, CollectionPeriod, Day, Member, Participant, Payment, Sen, Snapshot } from "@/lib/types";

export type MatrixColumn = {
  key: string;
  collection: Collection;
  period: CollectionPeriod | null;
  /** Header line, e.g. "Jamuan Akhir Tahun" or "Yuran KGK · Mac". */
  label: string;
  short: string;
};

export type MatrixCell =
  | { kind: "na"; column: MatrixColumn; member: Member }
  | { kind: "charge"; column: MatrixColumn; member: Member; ledger: ChargeLedger; status: CellStatus }
  | { kind: "voluntary"; column: MatrixColumn; member: Member; received: Sen; pending: Sen; count: number };

export type View = {
  today: Day;
  ledgers: Map<string, ChargeLedger>;
  chargesByCollection: Map<string, Charge[]>;
  participantsByCollection: Map<string, Participant[]>;
  periodsByCollection: Map<string, CollectionPeriod[]>;
  membersById: Map<string, Member>;
  collectionsById: Map<string, Collection>;
  collectionTotals: (collectionId: string) => Totals & { voluntary: Sen; participants: number };
  memberTotals: (memberId: string) => Totals;
  /** Members with nothing due now in this collection, out of members with a non-exempt charge. */
  collectionProgress: (collectionId: string) => { settled: number; total: number };
  memberLedgers: (memberId: string) => ChargeLedger[];
  columns: (collections: Collection[]) => MatrixColumn[];
  cell: (member: Member, column: MatrixColumn) => MatrixCell;
  paymentsFor: (memberId: string, chargeIds: string[] | null, collectionId?: string) => Payment[];
};

const groupBy = <T,>(rows: T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
};

export function cellStatus(ledger: ChargeLedger): CellStatus {
  if (ledger.future && ledger.status === "unpaid" && ledger.pending === 0) return "future";
  return ledger.status;
}

export function buildView(snapshot: Snapshot, today: Day): View {
  const index = indexLedger(snapshot.payments, snapshot.allocations, snapshot.periods);
  const ledgers = new Map(snapshot.charges.map((charge) => [charge.id, chargeLedger(charge, index, today)]));
  const chargesByCollection = groupBy(snapshot.charges, (charge) => charge.collectionId);
  const chargesByMember = groupBy(snapshot.charges, (charge) => charge.memberId);
  const participantsByCollection = groupBy(snapshot.participants, (row) => row.collectionId);
  const periodsByCollection = groupBy(snapshot.periods, (row) => row.collectionId);
  for (const list of periodsByCollection.values()) list.sort((a, b) => a.month.localeCompare(b.month));
  const membersById = new Map(snapshot.members.map((member) => [member.id, member]));
  const collectionsById = new Map(snapshot.collections.map((collection) => [collection.id, collection]));
  const chargeByCell = new Map(snapshot.charges.map((charge) => [`${charge.memberId}|${charge.collectionId}|${charge.periodId ?? ""}`, charge]));
  const participantKey = new Set(snapshot.participants.map((row) => `${row.memberId}|${row.collectionId}`));
  const paymentsByMember = groupBy(snapshot.payments, (payment) => payment.memberId);
  const allocationsByPayment = groupBy(snapshot.allocations, (allocation) => allocation.paymentId);

  const ledgerList = (charges: Charge[] | undefined) => (charges ?? []).map((charge) => ledgers.get(charge.id)!);

  return {
    today,
    ledgers,
    chargesByCollection,
    participantsByCollection,
    periodsByCollection,
    membersById,
    collectionsById,
    collectionTotals(collectionId) {
      const totals = totalsOf(ledgerList(chargesByCollection.get(collectionId)));
      return {
        ...totals,
        voluntary: voluntaryReceived(snapshot.payments, collectionId),
        participants: participantsByCollection.get(collectionId)?.length ?? 0,
      };
    },
    memberTotals: (memberId) => totalsOf(ledgerList(chargesByMember.get(memberId))),
    collectionProgress(collectionId) {
      const byMember = new Map<string, { charged: boolean; due: Sen }>();
      for (const ledger of ledgerList(chargesByCollection.get(collectionId))) {
        const entry = byMember.get(ledger.charge.memberId) ?? { charged: false, due: 0 };
        if (!ledger.charge.exempt) entry.charged = true;
        if (!ledger.future) entry.due += ledger.remaining;
        byMember.set(ledger.charge.memberId, entry);
      }
      let settled = 0;
      let total = 0;
      for (const entry of byMember.values()) {
        if (!entry.charged) continue;
        total += 1;
        if (entry.due === 0) settled += 1;
      }
      return { settled, total };
    },
    memberLedgers: (memberId) => ledgerList(chargesByMember.get(memberId)),
    columns(collections) {
      const columns: MatrixColumn[] = [];
      for (const collection of collections) {
        if (collection.type === "monthly") {
          for (const period of periodsByCollection.get(collection.id) ?? []) {
            columns.push({
              key: `${collection.id}|${period.id}`,
              collection,
              period,
              label: `${collection.name} · ${formatMonth(period.month, false)}`,
              short: formatMonth(period.month, false),
            });
          }
        } else {
          columns.push({ key: `${collection.id}|`, collection, period: null, label: collection.name, short: collection.name });
        }
      }
      return columns;
    },
    cell(member, column) {
      if (column.collection.type === "voluntary") {
        if (!participantKey.has(`${member.id}|${column.collection.id}`)) return { kind: "na", column, member };
        const mine = (paymentsByMember.get(member.id) ?? []).filter((payment) => payment.collectionId === column.collection.id);
        return {
          kind: "voluntary",
          column,
          member,
          received: mine.filter((p) => p.state === "confirmed").reduce((t, p) => t + p.amount, 0),
          pending: mine.filter((p) => p.state === "pending").reduce((t, p) => t + p.amount, 0),
          count: mine.filter((p) => p.state !== "reversed").length,
        };
      }
      const charge = chargeByCell.get(`${member.id}|${column.collection.id}|${column.period?.id ?? ""}`);
      if (!charge) return { kind: "na", column, member };
      const ledger = ledgers.get(charge.id)!;
      return { kind: "charge", column, member, ledger, status: cellStatus(ledger) };
    },
    paymentsFor(memberId, chargeIds, collectionId) {
      const wanted = chargeIds ? new Set(chargeIds) : null;
      return (paymentsByMember.get(memberId) ?? [])
        .filter((payment) => {
          if (collectionId && payment.collectionId === collectionId) return true;
          if (!wanted) return !collectionId;
          return (allocationsByPayment.get(payment.id) ?? []).some((allocation) => wanted.has(allocation.chargeId));
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

/** Allocations of a payment, for showing which charges it settled. */
export function allocationsOf(snapshot: Snapshot, paymentId: string) {
  return snapshot.allocations.filter((allocation) => allocation.paymentId === paymentId);
}

/** Collections in display order: active first, then drafts, completed, archived. */
export function sortCollections(collections: Collection[]) {
  const order = { active: 0, draft: 1, completed: 2, archived: 3 } as const;
  return [...collections].sort((a, b) => order[a.status] - order[b.status] || a.createdAt.localeCompare(b.createdAt));
}

export function collectionPeriodLabel(collection: Collection, period: CollectionPeriod | null) {
  return period ? `${collection.name} · ${formatMonth(period.month)}` : collection.name;
}
