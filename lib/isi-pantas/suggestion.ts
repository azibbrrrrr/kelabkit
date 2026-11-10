// The contract between whatever reads pasted text (the rule-based parser now, a JSON-mode
// model later) and the Isi Pantas UI. Both paths produce `Suggestion[]`; anything that comes
// from outside this codebase goes through `validateSuggestions` before the UI sees it.
// Nothing here writes: accepting a suggestion records a payment through the backend.

import { parseRinggit } from "@/lib/money/amount";
import type { Day, PaymentMethod, Sen } from "@/lib/types";

export const ISSUE_CODES = ["NAME_UNMATCHED", "NAME_AMBIGUOUS", "OVER_BALANCE", "POSSIBLE_DUPLICATE", "COLLECTION_UNKNOWN"] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

const METHODS: readonly PaymentMethod[] = ["cash", "transfer", "other"];

export type Suggestion = {
  /** Stable within one paste. */
  id: string;
  /** The best member match, or null when no member matched. */
  memberId: string | null;
  /** Every member the name could mean, best first. One entry when the match is clear. */
  candidates: string[];
  /** Null when no active collection could be told from the text. */
  collectionId: string | null;
  /** The month of a monthly collection; null for one-off and voluntary collections. */
  periodId: string | null;
  amountSen: Sen;
  method: PaymentMethod;
  /** Malaysian calendar day the money changed hands. */
  paidOn: Day;
  /** The source text this suggestion was read from, verbatim. */
  quote: string;
  /** [start, end) of the amount inside `quote`. The amount must literally appear there. */
  amountSpan: [number, number];
  /** 0..1. "Terima N yang yakin" takes only ≥ CONFIDENT with no issues. */
  confidence: number;
  issues: IssueCode[];
};

/** Bulk accept threshold. */
export const CONFIDENT = 0.85;

export const isConfident = (suggestion: Pick<Suggestion, "confidence" | "issues">) =>
  suggestion.confidence >= CONFIDENT && suggestion.issues.length === 0;

/** Ids the suggestions may point at: anything else is refused, never guessed. */
export type KnownIds = { members: ReadonlySet<string>; collections: ReadonlySet<string>; periods: ReadonlySet<string> };

export type Validated = { ok: true; suggestions: Suggestion[] } | { ok: false; errors: string[] };

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isIdOrNull = (value: unknown) => value === null || (typeof value === "string" && value.length > 0 && value.length <= 120);

/**
 * Checks untrusted input (e.g. a model's JSON) against the Suggestion shape, field by field.
 * Accepts `{ suggestions: [...] }` or a bare array. All-or-nothing: one bad entry refuses
 * the whole response, so the UI never shows half a reading of someone's message.
 */
export function validateSuggestions(input: unknown, known?: KnownIds): Validated {
  const list = Array.isArray(input) ? input : isObject(input) && Array.isArray(input.suggestions) ? input.suggestions : null;
  if (!list) return { ok: false, errors: ["Expected an array of suggestions or { suggestions: [...] }."] };
  const errors: string[] = [];
  const suggestions: Suggestion[] = [];
  const ids = new Set<string>();
  list.forEach((raw, i) => {
    const at = `suggestions[${i}]`;
    const fail = (message: string) => errors.push(`${at}: ${message}`);
    if (!isObject(raw)) return fail("not an object");
    const { id, memberId, candidates, collectionId, periodId, amountSen, method, paidOn, quote, amountSpan, confidence, issues } = raw;
    const before = errors.length;
    if (typeof id !== "string" || !id || id.length > 120) fail("id must be a non-empty string");
    else if (ids.has(id)) fail(`duplicate id ${id}`);
    if (!isIdOrNull(memberId)) fail("memberId must be a string or null");
    if (!Array.isArray(candidates) || candidates.some((c) => typeof c !== "string" || !c)) fail("candidates must be an array of member ids");
    if (!isIdOrNull(collectionId)) fail("collectionId must be a string or null");
    if (!isIdOrNull(periodId)) fail("periodId must be a string or null");
    if (periodId !== null && collectionId === null) fail("periodId needs a collectionId");
    if (typeof amountSen !== "number" || !Number.isInteger(amountSen) || amountSen <= 0) fail("amountSen must be a positive integer");
    if (typeof method !== "string" || !METHODS.includes(method as PaymentMethod)) fail("method must be cash, transfer or other");
    if (typeof paidOn !== "string" || !DAY_RE.test(paidOn)) fail("paidOn must be YYYY-MM-DD");
    if (typeof quote !== "string" || !quote.trim() || quote.length > 500) fail("quote must be the source text");
    if (typeof confidence !== "number" || !(confidence >= 0 && confidence <= 1)) fail("confidence must be between 0 and 1");
    if (!Array.isArray(issues) || issues.some((code) => !ISSUE_CODES.includes(code as IssueCode))) fail("issues must use known codes");
    const span = Array.isArray(amountSpan) && amountSpan.length === 2 && amountSpan.every((n) => Number.isInteger(n)) ? (amountSpan as [number, number]) : null;
    if (!span) fail("amountSpan must be [start, end]");
    else if (typeof quote === "string" && typeof amountSen === "number") {
      const [start, end] = span;
      if (start < 0 || end > quote.length || start >= end) fail("amountSpan is outside the quote");
      else {
        // The amount must be literally in the quote, so a reader cannot invent money.
        const parsed = parseRinggit(quote.slice(start, end));
        if (!parsed.ok || parsed.sen !== amountSen) fail(`amount ${amountSen} is not what the quote says at ${start}–${end}`);
      }
    }
    if (known) {
      if (typeof memberId === "string" && !known.members.has(memberId)) fail(`unknown member ${memberId}`);
      if (Array.isArray(candidates)) for (const c of candidates) if (typeof c === "string" && !known.members.has(c)) fail(`unknown candidate ${c}`);
      if (typeof collectionId === "string" && !known.collections.has(collectionId)) fail(`unknown collection ${collectionId}`);
      if (typeof periodId === "string" && !known.periods.has(periodId)) fail(`unknown period ${periodId}`);
    }
    if (errors.length > before) return;
    ids.add(id as string);
    suggestions.push({
      id: id as string,
      memberId: memberId as string | null,
      candidates: [...(candidates as string[])],
      collectionId: collectionId as string | null,
      periodId: periodId as string | null,
      amountSen: amountSen as number,
      method: method as PaymentMethod,
      paidOn: paidOn as Day,
      quote: quote as string,
      amountSpan: [span![0], span![1]],
      confidence: confidence as number,
      issues: [...new Set(issues as IssueCode[])],
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, suggestions };
}
