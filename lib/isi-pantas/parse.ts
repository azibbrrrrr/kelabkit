// Isi Pantas, rule-based reader. Turns pasted text (WhatsApp messages, bank statement
// lines, a treasurer's own list) into payment suggestions against the current snapshot.
// Pure and deterministic: no network, no clock (today comes in), no writes. A later model
// path must produce the same `Suggestion` shape and pass `validateSuggestions`.

import { normaliseName } from "@/lib/names";
import { parseRinggit } from "@/lib/money/amount";
import { chargeLedger, indexLedger, type LedgerIndex } from "@/lib/money/ledger";
import type { Allocation, Charge, Collection, CollectionPeriod, Day, Member, Payment, PaymentMethod, Sen } from "@/lib/types";
import type { IssueCode, Suggestion } from "@/lib/isi-pantas/suggestion";

export { CONFIDENT, isConfident, validateSuggestions, type IssueCode, type Suggestion } from "@/lib/isi-pantas/suggestion";

export type ParseContext = {
  /** Malaysian calendar day that "hari ini" means. */
  today: Day;
  members: Member[];
  collections: Collection[];
  periods: CollectionPeriod[];
  charges: Charge[];
  payments: Payment[];
  allocations: Allocation[];
};

// Words -------------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mac: 3, mar: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, june: 6,
  jul: 7, julai: 7, july: 7,
  ogo: 8, ogos: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  dis: 12, dec: 12, disember: 12, december: 12,
};
const MONTH_WORDS = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const TRANSFER_RE = /\b(transfer|trf|tf|bank\s*-?\s*in|bankin|banked\s+in|duit\s*now|duitnow|fpx|ibg|ibft|online|pindahan|jompay|tng|qr)\b/i;
const CASH_RE = /\b(cash|tunai)\b/i;

/** Honorifics, chat filler, method and bank-statement words: never part of a name. */
const FILLER = new Set(
  (
    "cikgu cgu cg teacher puan pn encik en tuan dr ustaz ustazah kak akak kakak abang abg bang adik dik sis bro " +
    "dah sudah telah bayar byr bayaran bagi beri hantar utk untuk ye ya yer yea ok okay terima kasih tq ty thanks tqvm " +
    "ni tu ini itu dari drp daripada fr from frm to ke kpd kepada dgn dengan sebanyak sahaja saja je jer nak mau pun lagi " +
    "baki ada saya sy aku dia kami and dan for paid pay payment masuk in bank duit wang rm ringgit now " +
    "hari harini semalam kelmarin tadi td pagi petang malam baru the of resit ref no bin binti bt bte al ap " +
    "cash tunai transfer trf tf bankin banked duitnow fpx ibg ibft online pindahan jompay tng qr cr credit inst fund ift " +
    "yuran bulanan sumbangan derma infaq sedekah"
  ).split(" "),
);

/** Words in collection names that say nothing about which collection is meant. */
const COLLECTION_STOP = new Set("kgk dan untuk the akhir sambutan puan encik cikgu tuan".split(" "));
const VOLUNTARY_WORDS = ["kebajikan", "sumbangan", "derma", "infaq", "sedekah"];
const MONTHLY_WORDS = ["yuran", "bulanan"];

// Small helpers -----------------------------------------------------------------------------

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function addDays(day: Day, count: number): Day {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function makeDay(year: number, month: number, day: number): Day | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** A day and month without a year: this year, or last year if that would be in the future. */
function resolveDayMonth(day: number, month: number, today: Day, year?: number): Day | null {
  const y = year ?? Number(today.slice(0, 4));
  const candidate = makeDay(y, month, day);
  if (!candidate) return null;
  if (year === undefined && candidate > today) return makeDay(y - 1, month, day);
  return candidate;
}

const words = (text: string) => (text.toLowerCase().match(/[a-zÀ-ɏ]+/g) ?? []);

// Reading one segment -----------------------------------------------------------------------

type Amount = { sen: Sen; span: [number, number]; strong: boolean };

/** Every amount-like number in the text, with dates, years, times and phone numbers left out. */
export function findAmounts(text: string): Amount[] {
  const found: Amount[] = [];
  // Malaysian mobile numbers ("012-345 6781") span spaces, so mask them before reading numbers.
  const phones = [...text.matchAll(/(?<!\d)(?:\+?60|0)1\d-?\s?\d{3,4}\s?\d{3,4}(?!\d)/g)].map((m) => [m.index!, m.index! + m[0].length]);
  const re = /(?<![\w/.,:-])(rm\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\w/:-]|\.\d)/gi;
  for (const match of text.matchAll(re)) {
    const [whole, rm, digits, fraction] = match;
    const start = match.index!;
    const end = start + whole.length;
    if (phones.some(([a, b]) => start < b && end > a)) continue;
    const after = text.slice(end);
    if (!rm && new RegExp(`^\\s*(${MONTH_WORDS})\\b`, "i").test(after)) continue; // "10 Nov" is a date
    const plain = digits.replace(/,/g, "");
    if (!rm && !fraction && plain.length === 4 && Number(plain) >= 1900 && Number(plain) <= 2100) continue; // a year
    if (!rm && plain.length > 6) continue; // account or phone number
    const parsed = parseRinggit(whole);
    if (!parsed.ok || parsed.sen <= 0) continue;
    found.push({ sen: parsed.sen, span: [start, end], strong: Boolean(rm || fraction) });
  }
  return found;
}

/** The day the money moved: "semalam", "hari ini", "10/11", "10 Nov"; else today. */
export function findPaidOn(text: string, today: Day): { day: Day; explicit: boolean; monthWordUsed: number | null } {
  const lower = text.toLowerCase();
  if (/\bkelmarin\b/.test(lower)) return { day: addDays(today, -2), explicit: true, monthWordUsed: null };
  if (/\bsemalam\b/.test(lower)) return { day: addDays(today, -1), explicit: true, monthWordUsed: null };
  const slash = lower.match(/(?<![\d.])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d.])/);
  if (slash) {
    const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : undefined;
    const day = resolveDayMonth(Number(slash[1]), Number(slash[2]), today, year);
    if (day && day <= today) return { day, explicit: true, monthWordUsed: null };
  }
  const named = lower.match(new RegExp(`(?<![\\d.])(\\d{1,2})\\s*(${MONTH_WORDS})\\b`));
  if (named) {
    const month = MONTHS[named[2]];
    const day = resolveDayMonth(Number(named[1]), month, today);
    if (day) return { day, explicit: true, monthWordUsed: month };
  }
  if (/\b(hari\s*ini|harini|tadi|td)\b/.test(lower)) return { day: today, explicit: true, monthWordUsed: null };
  return { day: today, explicit: false, monthWordUsed: null };
}

export function findMethod(text: string): { method: PaymentMethod; explicit: boolean } {
  if (TRANSFER_RE.test(text)) return { method: "transfer", explicit: true };
  if (CASH_RE.test(text)) return { method: "cash", explicit: true };
  return { method: "cash", explicit: false };
}

/** A month named on its own ("yuran nov"), not as part of a date ("10 Nov"). */
function findPeriodMonth(text: string, dateMonth: number | null, ignore: ReadonlySet<string>): number | null {
  const lower = text.toLowerCase();
  for (const hit of lower.matchAll(new RegExp(`\\b(${MONTH_WORDS})\\b`, "g"))) {
    if (ignore.has(hit[1])) continue; // "Mei" in "Tan Mei Ling" is a name, not May
    const month = MONTHS[hit[1]];
    const before = lower.slice(0, hit.index).trimEnd();
    if (/\d$/.test(before) && dateMonth === month) continue; // the "Nov" of "10 Nov"
    return month;
  }
  return null;
}

// Collections -------------------------------------------------------------------------------

type CollectionKeys = { collection: Collection; keys: string[] };

function collectionKeys(collections: Collection[], members: Member[]): CollectionKeys[] {
  const nameTokens = new Set(members.flatMap((member) => words(normaliseName(member.name))));
  return collections.map((collection) => {
    const own = words(collection.name).filter((w) => w.length >= 3 && !COLLECTION_STOP.has(w) && !nameTokens.has(w) && !(w in MONTHS));
    const extra = collection.type === "voluntary" ? VOLUNTARY_WORDS : collection.type === "monthly" ? MONTHLY_WORDS : [];
    return { collection, keys: [...new Set([...own, ...extra])] };
  });
}

const keyHit = (token: string, key: string) =>
  token === key || (token.length >= 4 && key.startsWith(token)) || (key.length >= 6 && token.length >= 5 && levenshtein(token, key) <= 1);

function matchCollection(tokens: string[], keyed: CollectionKeys[]): { collection: Collection | null; used: Set<string>; tie: boolean } {
  let best: { collection: Collection; score: number; used: Set<string> } | null = null;
  let tie = false;
  for (const entry of keyed) {
    const used = new Set<string>();
    let score = 0;
    for (const key of entry.keys) {
      const token = tokens.find((t) => keyHit(t, key));
      if (token) {
        score += 1;
        used.add(token);
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { collection: entry.collection, score, used };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  if (!best) return { collection: null, used: new Set(), tie: false };
  return { collection: tie ? null : best.collection, used: best.used, tie };
}

// Members -----------------------------------------------------------------------------------

type MemberMatch = { member: Member; score: number };

function tokenScore(token: string, memberToken: string) {
  if (token === memberToken) return 1;
  if (token.length >= 3 && memberToken.startsWith(token)) return 0.8;
  const limit = Math.min(token.length, memberToken.length) >= 5 ? 2 : Math.min(token.length, memberToken.length) === 4 ? 1 : 0;
  if (limit > 0 && levenshtein(token, memberToken) <= limit) return 0.6;
  return 0;
}

/** Members a set of name tokens could mean, best first. Each member token is used once. */
export function matchMembers(tokens: string[], members: Member[]): MemberMatch[] {
  const matches: MemberMatch[] = [];
  for (const member of members) {
    const memberTokens = words(normaliseName(member.name)).filter((w) => !FILLER.has(w));
    const taken = new Set<number>();
    let score = 0;
    for (const token of tokens) {
      let bestScore = 0;
      let bestIndex = -1;
      memberTokens.forEach((mt, i) => {
        if (taken.has(i)) return;
        const s = tokenScore(token, mt);
        if (s > bestScore) {
          bestScore = s;
          bestIndex = i;
        }
      });
      if (bestIndex >= 0) {
        taken.add(bestIndex);
        score += bestScore;
      }
    }
    if (score >= 0.6) matches.push({ member, score });
  }
  return matches.sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name, "ms"));
}

/** Two matches this close are a coin toss, not a match. */
const AMBIGUITY_MARGIN = 0.3;

// Target checks (shared with reassess) ------------------------------------------------------

type Prepared = ParseContext & { index: LedgerIndex; active: Collection[] };

function prepare(ctx: ParseContext): Prepared {
  return {
    ...ctx,
    index: indexLedger(ctx.payments, ctx.allocations, ctx.periods),
    active: ctx.collections.filter((collection) => collection.status === "active"),
  };
}

export function chargeFor(ctx: Pick<ParseContext, "charges">, memberId: string, collectionId: string, periodId: string | null) {
  return ctx.charges.find((c) => c.memberId === memberId && c.collectionId === collectionId && (c.periodId ?? null) === periodId) ?? null;
}

/** The month of a monthly collection to put money on: the named month, else the oldest still payable. */
function pickPeriod(p: Prepared, collection: Collection, memberId: string | null, month: number | null): CollectionPeriod | null {
  const periods = p.periods.filter((row) => row.collectionId === collection.id).sort((a, b) => a.month.localeCompare(b.month));
  if (!periods.length) return null;
  if (month !== null) {
    const named = periods.filter((row) => Number(row.month.slice(5)) === month);
    const thisYear = named.find((row) => row.month.startsWith(p.today.slice(0, 4)));
    return thisYear ?? named[0] ?? null;
  }
  if (memberId) {
    for (const period of periods) {
      const charge = chargeFor(p, memberId, collection.id, period.id);
      if (!charge || charge.exempt) continue;
      const ledger = chargeLedger(charge, p.index, p.today);
      if (!ledger.future && ledger.payable > 0) return period;
    }
  }
  return periods.find((row) => row.month === p.today.slice(0, 7)) ?? null;
}

function targetIssues(p: Prepared, memberId: string, collectionId: string, periodId: string | null, amount: Sen): IssueCode[] {
  const collection = p.collections.find((row) => row.id === collectionId);
  if (!collection) return ["COLLECTION_UNKNOWN"];
  const issues: IssueCode[] = [];
  const weekAgo = addDays(p.today, -7);
  const recent = p.payments.filter((pay) => pay.memberId === memberId && pay.state !== "reversed" && pay.paidOn >= weekAgo);
  if (collection.type === "voluntary") {
    if (recent.some((pay) => pay.collectionId === collectionId && pay.amount === amount)) issues.push("POSSIBLE_DUPLICATE");
    return issues;
  }
  const charge = chargeFor(p, memberId, collectionId, periodId);
  // No charge for this member here (not a participant, or no such month): nothing to pay into.
  if (!charge || charge.exempt) return ["COLLECTION_UNKNOWN"];
  const ledger = chargeLedger(charge, p.index, p.today);
  if (amount > ledger.payable) issues.push("OVER_BALANCE");
  const onCharge = new Set(p.allocations.filter((a) => a.chargeId === charge.id && a.amount === amount).map((a) => a.paymentId));
  if (recent.some((pay) => onCharge.has(pay.id))) issues.push("POSSIBLE_DUPLICATE");
  return issues;
}

/** Without a collection word: the member's one charge whose balance is exactly this amount. */
function inferCharge(p: Prepared, memberId: string, amount: Sen): Charge | null {
  const activeIds = new Set(p.active.map((c) => c.id));
  const fits = p.charges
    .filter((c) => c.memberId === memberId && activeIds.has(c.collectionId) && !c.exempt)
    .map((c) => chargeLedger(c, p.index, p.today))
    .filter((ledger) => ledger.payable === amount);
  if (!fits.length) return null;
  const due = fits.filter((ledger) => !ledger.future);
  const pool = due.length ? due : fits;
  const byCollection = new Set(pool.map((ledger) => ledger.charge.collectionId));
  if (byCollection.size > 1) return null; // fits two collections: let the treasurer pick
  return pool.sort((a, b) => (a.charge.dueDate ?? "").localeCompare(b.charge.dueDate ?? ""))[0].charge;
}

// Public API --------------------------------------------------------------------------------

/** Splits a line holding several payments ("Amir 15 baju, Tan 25 jamuan") when each part has an amount. */
function segmentsOf(line: string): string[] {
  const parts = line.split(/;|,(?!\d{3}\b)/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => findAmounts(part).length > 0)) return parts;
  return [line.trim()];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function parsePaste(text: string, ctx: ParseContext, options: { idPrefix?: string } = {}): Suggestion[] {
  const p = prepare(ctx);
  const members = ctx.members.filter((member) => member.active);
  const keyed = collectionKeys(p.active, members);
  const memberWords = new Set(members.flatMap((member) => words(normaliseName(member.name))));
  const out: Suggestion[] = [];
  const prefix = options.idPrefix ?? "s";

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    for (const quote of segmentsOf(line)) {
      const amounts = findAmounts(quote);
      if (!amounts.length) continue;
      const amount = amounts.find((a) => a.strong) ?? amounts[0];
      const paid = findPaidOn(quote, p.today);
      const method = findMethod(quote);
      const tokens = words(quote);
      const coll = matchCollection(tokens, keyed);
      const nameTokens = tokens.filter(
        (t) => t.length >= 2 && !FILLER.has(t) && !(t in MONTHS && !memberWords.has(t)) && !coll.used.has(t),
      );

      const matches = matchMembers(nameTokens, members);
      const best = matches[0] ?? null;
      const month = findPeriodMonth(quote, paid.monthWordUsed, new Set(best ? words(normaliseName(best.member.name)) : []));
      const close = best ? matches.filter((m) => m.score >= best.score - AMBIGUITY_MARGIN) : [];
      const issues: IssueCode[] = [];
      let confidence = 1;

      if (!best) {
        issues.push("NAME_UNMATCHED");
      } else {
        if (close.length > 1) issues.push("NAME_AMBIGUOUS");
        confidence *= Math.min(1, 0.6 + 0.35 * best.score);
      }
      const memberId = best?.member.id ?? null;

      let collectionId: string | null = coll.collection?.id ?? null;
      let periodId: string | null = null;
      if (coll.collection) {
        if (coll.collection.type === "monthly") {
          periodId = pickPeriod(p, coll.collection, memberId, month)?.id ?? null;
          if (month === null) confidence *= 0.92;
        }
      } else if (memberId) {
        const inferred = inferCharge(p, memberId, amount.sen);
        if (inferred) {
          collectionId = inferred.collectionId;
          periodId = inferred.periodId;
          confidence *= 0.75;
        }
      }
      if (!collectionId) issues.push("COLLECTION_UNKNOWN");
      else if (memberId) issues.push(...targetIssues(p, memberId, collectionId, periodId, amount.sen));

      if (!method.explicit) confidence *= 0.97;
      if (amounts.length > 1 && !amount.strong) confidence *= 0.85;
      if (issues.length) confidence = Math.min(confidence, 0.6);

      out.push({
        id: `${prefix}${out.length + 1}`,
        memberId,
        candidates: (close.length ? close : matches.slice(0, 1)).map((m) => m.member.id),
        collectionId,
        periodId,
        amountSen: amount.sen,
        method: method.method,
        paidOn: paid.day,
        quote,
        amountSpan: amount.span,
        confidence: round2(confidence),
        issues: [...new Set(issues)],
      });
    }
  }
  return out;
}

/**
 * The treasurer picked the member and/or charge in "Ubah". Their pick settles the name, so
 * name issues go; balance, duplicate and collection checks run again against the new target.
 */
export function reassess(
  suggestion: Suggestion,
  ctx: ParseContext,
  pick: { memberId: string; collectionId: string | null; periodId: string | null },
): Suggestion {
  const p = prepare(ctx);
  const issues: IssueCode[] = pick.collectionId ? targetIssues(p, pick.memberId, pick.collectionId, pick.periodId, suggestion.amountSen) : ["COLLECTION_UNKNOWN"];
  return {
    ...suggestion,
    memberId: pick.memberId,
    candidates: [pick.memberId],
    collectionId: pick.collectionId,
    periodId: pick.collectionId ? pick.periodId : null,
    issues,
    confidence: issues.length ? Math.min(suggestion.confidence, 0.6) : 1,
  };
}
