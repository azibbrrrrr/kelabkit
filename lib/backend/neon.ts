// KelabBackend for signed-in accounts. Each method is a Next.js server action
// (app/actions/*) that reads the session on the server, resolves the active club and runs
// one database transaction as the restricted role. This file runs in the browser and holds
// no credentials: it only unwraps the action's Result into a value or a KelabError.

import { addMembers, setMemberActive, updateMember } from "@/app/actions/members";
import { addParticipants, createCollection, setCollectionIcon, setCollectionStatus, updateCollection } from "@/app/actions/collections";
import { confirmPayment, recordContribution, recordPayment, reversePayment, setChargeAmount, setChargeExempt } from "@/app/actions/payments";
import { updateClub } from "@/app/actions/club";
import { loadSnapshot } from "@/app/actions/data";
import type { KelabBackend } from "@/lib/backend/types";
import { KelabError, type ErrorCode } from "@/lib/errors";
import type { Snapshot } from "@/lib/types";

type Result<T> = { ok: true; value: T; snapshot?: Snapshot } | { ok: false; code: ErrorCode; detail?: string };

// A change comes back with the snapshot its own transaction read. It is handed to whoever
// registered here (the data provider), so a change costs one request instead of two.
let snapshotSink: ((snapshot: Snapshot) => void) | null = null;
export function setSnapshotSink(sink: ((snapshot: Snapshot) => void) | null) {
  snapshotSink = sink;
}

async function call<T>(action: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await action;
  } catch {
    // The request itself failed (offline, deploy in progress): nothing reached the database.
    throw new KelabError("NETWORK");
  }
  if (result.ok) {
    if (result.snapshot) snapshotSink?.(result.snapshot);
    return result.value;
  }
  if (result.code === "UNAUTHENTICATED" && typeof window !== "undefined") window.location.assign("/masuk/");
  throw new KelabError(result.code, result.detail);
}

export const neonBackend: KelabBackend = {
  kind: "neon",
  load: () => call(loadSnapshot()),
  addMembers: (members) => call(addMembers(members)),
  updateMember: (id, changes) => call(updateMember(id, changes)),
  setMemberActive: (id, active) => call(setMemberActive(id, active)),
  createCollection: (input) => call(createCollection(input)),
  updateCollection: (id, changes) => call(updateCollection(id, changes)),
  setCollectionStatus: (id, status) => call(setCollectionStatus(id, status)),
  setCollectionIcon: (id, icon) => call(setCollectionIcon(id, icon)),
  addParticipants: (collectionId, participants) => call(addParticipants(collectionId, participants)),
  setChargeAmount: (chargeId, amount, reason) => call(setChargeAmount(chargeId, amount, reason)),
  setChargeExempt: (chargeId, exempt, reason) => call(setChargeExempt(chargeId, exempt, reason)),
  recordPayment: (input) => call(recordPayment(input)),
  recordContribution: (input) => call(recordContribution(input)),
  confirmPayment: (paymentId) => call(confirmPayment(paymentId)),
  reversePayment: (paymentId, reason) => call(reversePayment(paymentId, reason)),
  // Metadata is read by load(); the bytes need object storage, which comes later.
  addAttachments: () => Promise.reject(new KelabError("NOT_AVAILABLE")),
  removeAttachment: () => Promise.reject(new KelabError("NOT_AVAILABLE")),
  getAttachmentBlob: () => Promise.reject(new KelabError("NOT_AVAILABLE")),
  updateClub: (changes) => call(updateClub(changes)),
  resetDemo: () => Promise.reject(new KelabError("NOT_AVAILABLE")),
};
