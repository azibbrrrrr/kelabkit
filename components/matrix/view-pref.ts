// The Kad / Jadual choice is a per-browser display preference, never part of the data.

export const VIEW_KEY = "kelabkit-matrix-view-v1";
import { isMatrixLayout, type MatrixLayout } from "@/lib/prefs";

export type { MatrixLayout };

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
