// Column widths for the desktop matrix grid. A display preference only (see lib/prefs.ts): kept in this browser's
// localStorage, never in the snapshot or the backend. Keys are "ahli", a collection id (one-off
// and voluntary columns) or a period id (one month of a monthly collection).

export const WIDTHS_STORAGE_KEY = "kelabkit-matrix-widths-v1";
export const MEMBER_KEY = "ahli";
/** The Baki semasa column is not resizable. */
export const BALANCE_W = 120;
/** One ← / → press on a resize handle. */
export const WIDTH_STEP = 16;

export type WidthKind = "member" | "single" | "month";
export type WidthPreset = "narrow" | "normal" | "wide";

export const WIDTH_LIMITS: Record<WidthKind, { min: number; max: number } & Record<WidthPreset, number>> = {
  member: { min: 180, max: 480, narrow: 180, normal: 224, wide: 320 },
  single: { min: 120, max: 480, narrow: 120, normal: 200, wide: 320 },
  month: { min: 120, max: 480, narrow: 120, normal: 136, wide: 200 },
};

import { sanitizeWidths, type Widths } from "@/lib/prefs";

export type { Widths };

export function clampWidth(kind: WidthKind, width: number) {
  const { min, max } = WIDTH_LIMITS[kind];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** Reads saved widths; anything malformed is dropped rather than trusted. */
export function readWidths(storage: Pick<Storage, "getItem"> | undefined): Widths {
  try {
    return sanitizeWidths(JSON.parse(storage?.getItem(WIDTHS_STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function writeWidths(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, widths: Widths) {
  try {
    if (Object.keys(widths).length === 0) storage?.removeItem(WIDTHS_STORAGE_KEY);
    else storage?.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Private mode or a full quota: widths just do not survive a reload.
  }
}

/**
 * Rendered widths of the resizable data columns, plus the Baki semasa width. A column the
 * treasurer sized keeps exactly that width; the others start at their default. When everything
 * fits with room to spare, the spare width goes to the unsized columns in proportion, so the grid
 * still spans its card and Baki semasa stays at the right edge. When every column is sized, the
 * spare width goes to Baki semasa instead: a chosen width is never silently overridden.
 */
export function layoutWidths(columns: { kind: WidthKind; size?: number }[], fixed: number, available: number): { columns: number[]; balance: number } {
  const base = columns.map((column) => (column.size === undefined ? WIDTH_LIMITS[column.kind].normal : clampWidth(column.kind, column.size)));
  const extra = Math.floor(available - fixed - base.reduce((sum, width) => sum + width, 0));
  if (extra <= 0) return { columns: base, balance: BALANCE_W };
  const flex = columns.map((column, i) => (column.size === undefined ? i : -1)).filter((i) => i >= 0);
  if (flex.length === 0) return { columns: base, balance: BALANCE_W + extra };
  const flexTotal = flex.reduce((sum, i) => sum + base[i], 0);
  const out = [...base];
  let given = 0;
  for (const i of flex) {
    const share = Math.floor((extra * base[i]) / flexTotal);
    out[i] += share;
    given += share;
  }
  out[flex[flex.length - 1]] += extra - given; // rounding remainder, so the sum is exact
  return { columns: out, balance: BALANCE_W };
}

/** window.localStorage, or undefined where reading it throws (sandboxed frames, blocked site data). */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
