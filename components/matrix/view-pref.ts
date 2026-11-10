// The Kad / Jadual, Selesa / Padat and footer-summary choices are per-browser display preferences
// (demo and signed out), never part of the data.

export const VIEW_KEY = "kelabkit-matrix-view-v1";
export const DENSITY_KEY = "kelabkit-matrix-density-v1";
export const SUMMARY_KEY = "kelabkit-matrix-summary-v1";
import { isMatrixDensity, isMatrixLayout, isMatrixSummary, type MatrixDensity, type MatrixLayout, type MatrixSummary } from "@/lib/prefs";

export type { MatrixDensity, MatrixLayout, MatrixSummary };

export function readLayout(storage: Storage | undefined): MatrixLayout | null {
  try {
    const value = storage?.getItem(VIEW_KEY);
    return isMatrixLayout(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLayout(storage: Storage | undefined, layout: MatrixLayout) {
  try {
    storage?.setItem(VIEW_KEY, layout);
  } catch {
    // Blocked or full storage: the choice still applies for this visit.
  }
}

function read<T>(storage: Storage | undefined, key: string, guard: (value: unknown) => value is T): T | null {
  try {
    const value = storage?.getItem(key);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Blocked or full storage: the choice still applies for this visit.
  }
}

export const readDensity = (storage: Storage | undefined) => read<MatrixDensity>(storage, DENSITY_KEY, isMatrixDensity);
export const writeDensity = (storage: Storage | undefined, density: MatrixDensity) => write(storage, DENSITY_KEY, density);
export const readSummary = (storage: Storage | undefined) => read<MatrixSummary>(storage, SUMMARY_KEY, isMatrixSummary);
export const writeSummary = (storage: Storage | undefined, summary: MatrixSummary) => write(storage, SUMMARY_KEY, summary);
