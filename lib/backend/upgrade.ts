import type { Snapshot } from "@/lib/types";

/** Fills fields added since a snapshot was saved, so older demo data keeps working without a reset. */
export function upgradeSnapshot(state: Snapshot): Snapshot {
  for (const collection of state.collections) collection.icon ??= null;
  state.attachments ??= [];
  return state;
}
