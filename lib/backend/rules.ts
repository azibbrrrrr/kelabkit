// Input rules shared by every KelabBackend implementation (demo in the browser, neon on the
// server), so a name or an amount is refused identically in both.

import type { ClubChanges } from "@/lib/backend/types";
import { KelabError } from "@/lib/errors";
import { MAX_AMOUNT_SEN } from "@/lib/money/amount";
import type { Sen } from "@/lib/types";

export function cleanName(name: string) {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) throw new KelabError("NAME_REQUIRED");
  if (value.length > 120) throw new KelabError("NAME_TOO_LONG");
  return value;
}

/**
 * Tetapan > Maklumat kelab. The one rule set for both backends (the form shows the same limits):
 * name and treasurer 1 to 120 characters, session 1 to 40, school optional and at most 120.
 * Returns only the fields that were given, trimmed.
 */
export function checkClubChanges(changes: ClubChanges): ClubChanges {
  const out: ClubChanges = {};
  if (changes.name !== undefined) out.name = cleanName(changes.name);
  if (changes.treasurerName !== undefined) out.treasurerName = cleanName(changes.treasurerName);
  if (changes.session !== undefined) {
    const session = changes.session.trim();
    if (!session) throw new KelabError("SESSION_REQUIRED");
    if (session.length > 40) throw new KelabError("SESSION_TOO_LONG");
    out.session = session;
  }
  if (changes.school !== undefined) {
    const school = changes.school?.trim() || null;
    if (school && school.length > 120) throw new KelabError("SCHOOL_TOO_LONG");
    out.school = school;
  }
  return out;
}

export function checkAmount(amount: Sen, allowZero = false) {
  if (!Number.isInteger(amount)) throw new KelabError("AMOUNT_INVALID");
  if (amount < 0) throw new KelabError("AMOUNT_NEGATIVE");
  if (amount === 0 && !allowZero) throw new KelabError("AMOUNT_ZERO");
  if (amount > MAX_AMOUNT_SEN) throw new KelabError("AMOUNT_TOO_LARGE");
}

export function checkReason(reason: string | null | undefined) {
  if (!reason || !reason.trim()) throw new KelabError("REASON_REQUIRED");
  return reason.trim();
}
