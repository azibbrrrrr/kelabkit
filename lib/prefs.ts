// Per-user display preferences, as one validated shape shared by the browser (localStorage in the
// demo, a debounced save in signed-in mode) and the server (kk_save_prefs). Display only: nothing
// here can touch a payment record. Unknown keys and malformed values are dropped, never trusted.

import { isLocale, type Locale } from "@/lib/i18n";
import { isThemeId, type ThemeId } from "@/lib/themes";

export type MatrixLayout = "cards" | "grid";
/** Row height of the Jadual grid: Selesa (comfortable, the default) or Padat (compact). */
export type MatrixDensity = "comfortable" | "compact";
/** What the grid's footer row shows per column. */
export type MatrixSummary = "received" | "overdue" | "percent" | "paidCount";
export type Widths = Record<string, number>;

export type StoredPrefs = {
  theme?: ThemeId;
  floral?: boolean;
  locale?: Locale;
  matrixLayout?: MatrixLayout;
  matrixDensity?: MatrixDensity;
  matrixSummary?: MatrixSummary;
  /** Keys: "ahli", a collection id or a period id. */
  matrixWidths?: Widths;
};

/** Largest JSON a patch or the stored document may have. kk_save_prefs enforces the same number. */
export const MAX_PREFS_BYTES = 16_384;
export const MAX_WIDTH_ENTRIES = 300;
const MAX_WIDTH_KEY = 40;
const MAX_WIDTH_PX = 2000;

export const isMatrixLayout = (value: unknown): value is MatrixLayout => value === "cards" || value === "grid";

export const isMatrixDensity = (value: unknown): value is MatrixDensity => value === "comfortable" || value === "compact";
export const MATRIX_SUMMARIES = ["received", "overdue", "percent", "paidCount"] as const satisfies readonly MatrixSummary[];
export const isMatrixSummary = (value: unknown): value is MatrixSummary => MATRIX_SUMMARIES.includes(value as MatrixSummary);

/** Keeps only plausible entries: a short key and a finite pixel width. */
export function sanitizeWidths(value: unknown): Widths {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const widths: Widths = {};
  let count = 0;
  for (const [key, width] of Object.entries(value)) {
    if (count >= MAX_WIDTH_ENTRIES) break;
    if (key.length === 0 || key.length > MAX_WIDTH_KEY) continue;
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || width > MAX_WIDTH_PX) continue;
    widths[key] = Math.round(width);
    count += 1;
  }
  return widths;
}

/** The known keys with valid values; everything else is dropped. Never throws. */
export function parsePrefs(input: unknown): StoredPrefs {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const out: StoredPrefs = {};
  if (isThemeId(raw.theme)) out.theme = raw.theme;
  if (typeof raw.floral === "boolean") out.floral = raw.floral;
  if (isLocale(raw.locale)) out.locale = raw.locale;
  if (isMatrixLayout(raw.matrixLayout)) out.matrixLayout = raw.matrixLayout;
  if (isMatrixDensity(raw.matrixDensity)) out.matrixDensity = raw.matrixDensity;
  if (isMatrixSummary(raw.matrixSummary)) out.matrixSummary = raw.matrixSummary;
  if ("matrixWidths" in raw) out.matrixWidths = sanitizeWidths(raw.matrixWidths);
  return out;
}

/** Serialised size, so an oversized request is refused instead of silently truncated. */
export const prefsBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? "").length;

/** `patch` wins key by key (last write wins); a key absent from the patch keeps its value. */
export function mergePrefs(base: StoredPrefs, patch: StoredPrefs): StoredPrefs {
  return { ...base, ...patch };
}

export const isEmptyPrefs = (prefs: StoredPrefs) => Object.keys(prefs).length === 0;

/** Same keys, same values (matrixWidths compared entry by entry). */
export function samePrefs(a: StoredPrefs, b: StoredPrefs) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof StoredPrefs>;
  for (const key of keys) {
    if (key === "matrixWidths") {
      const x = a.matrixWidths ?? {};
      const y = b.matrixWidths ?? {};
      const xk = Object.keys(x);
      if (xk.length !== Object.keys(y).length || xk.some((k) => x[k] !== y[k])) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}

export type PrefsSaver = {
  /** Adds a change; the send happens after `delayMs` of quiet. */
  queue: (patch: StoredPrefs) => void;
  /** Sends what is pending now (page hide, tests). Resolves when the send settled. */
  flush: () => Promise<void>;
  pending: () => StoredPrefs;
};

/**
 * Debounced, ordered, last-write-wins saving. Changes within the delay merge into one patch
 * (a column drag fires many); only one send is in flight at a time so the server sees them in
 * order; a failed send keeps its patch (newer values win) for the next attempt instead of losing it.
 */
export function createPrefsSaver(options: {
  send: (patch: StoredPrefs) => Promise<boolean>;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): PrefsSaver {
  const delay = options.delayMs ?? 800;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let pending: StoredPrefs = {};
  let timer: unknown = null;
  let chain: Promise<void> = Promise.resolve();

  const run = () => {
    timer = null;
    chain = chain.then(async () => {
      if (isEmptyPrefs(pending)) return;
      const taken = pending;
      pending = {};
      let ok = false;
      try {
        ok = await options.send(taken);
      } catch {
        ok = false;
      }
      if (!ok) pending = mergePrefs(taken, pending);
    });
    return chain;
  };

  return {
    queue(patch) {
      pending = mergePrefs(pending, patch);
      if (timer !== null) clearTimer(timer);
      timer = setTimer(run, delay);
    },
    flush() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      return run();
    },
    pending: () => pending,
  };
}

/** Set on <html> once the signed-in provider owns the preferences, so the root provider does not overwrite them with this browser's copy. */
export const PREFS_SOURCE_ATTR = "prefsSource";

/**
 * Inline script that puts the saved account theme on <html> as this part of the page arrives, before
 * the shell paints. Built only from validated enum values (parsePrefs), and `<` is escaped anyway.
 * Nothing is emitted when the account has no saved preferences: the localStorage boot script stands.
 */
export function accountBootScript(prefs: StoredPrefs | null): string | null {
  if (!prefs) return null;
  const lines = ["var r=document.documentElement;"];
  if (prefs.theme) lines.push(`r.dataset.accent=${JSON.stringify(prefs.theme)};`);
  if (prefs.floral !== undefined) lines.push(`r.dataset.floral=${JSON.stringify(prefs.floral ? "on" : "off")};`);
  if (prefs.locale) lines.push(`r.lang=${JSON.stringify(prefs.locale)};`);
  lines.push(`r.dataset.${PREFS_SOURCE_ATTR}="account";`);
  return `(function(){${lines.join("")}})();`.replace(/</g, "\\u003c");
}
