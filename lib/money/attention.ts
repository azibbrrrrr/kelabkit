// Who needs a nudge first. Pure ranking over ledgers the caller already derived; "overdue" is
// the ledger's own flag (remaining > 0, due date before today, not a future month), so
// pending money never reduces what a member is listed as owing.

import type { ChargeLedger } from "@/lib/money/ledger";
import type { Day, Member, Sen } from "@/lib/types";

export type AttentionRow = {
  member: Member;
  /** Sum of remaining on this member's overdue charges. */
  overdue: Sen;
  /** Earliest due date among those charges. */
  oldestDue: Day;
  /** Whole days from that date to today (at least 1, since overdue means before today). */
  daysOverdue: number;
};

const DAY_MS = 86_400_000;

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD), DST-proof because both are read as UTC. */
export function daysBetween(from: Day, to: Day) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Members with overdue money, most urgent first: larger overdue amount, then the older
 * oldest-due date, then name. Members with nothing overdue are left out.
 */
export function rankAttention(members: Member[], ledgersOf: (memberId: string) => ChargeLedger[], today: Day): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const member of members) {
    let overdue = 0;
    let oldestDue: Day | null = null;
    for (const ledger of ledgersOf(member.id)) {
      if (!ledger.overdue || !ledger.charge.dueDate) continue;
      overdue += ledger.remaining;
      if (!oldestDue || ledger.charge.dueDate < oldestDue) oldestDue = ledger.charge.dueDate;
    }
    if (overdue > 0 && oldestDue) rows.push({ member, overdue, oldestDue, daysOverdue: daysBetween(oldestDue, today) });
  }
  return rows.sort(
    (a, b) => b.overdue - a.overdue || a.oldestDue.localeCompare(b.oldestDue) || a.member.name.localeCompare(b.member.name, "ms"),
  );
}
