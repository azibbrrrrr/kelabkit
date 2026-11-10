// KelabBackend for signed-in accounts. Each method is a Next.js server action
// (app/actions/*) that reads the session on the server, resolves the active club and runs
// one database transaction as the restricted role. This file runs in the browser and holds
// no credentials: it only unwraps the action's Result into a value or a KelabError.

import { addMembers, setMemberActive, updateMember } from "@/app/actions/members";
import { addParticipants, createCollection, setCollectionIcon, setCollectionStatus, updateCollection } from "@/app/actions/collections";
import { confirmPayment, recordContribution, recordPayment, reversePayment, setChargeAmount, setChargeExempt } from "@/app/actions/payments";
import { confirmAttachmentUploads, getAttachmentUrl, prepareAttachmentUploads, removeAttachment } from "@/app/actions/attachments";
import { updateClub } from "@/app/actions/club";
import { loadSnapshot } from "@/app/actions/data";
import { checkAttachmentBatch } from "@/lib/attachments";
import { sha256Hex } from "@/lib/attachments-client";
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

// Bytes never pass through a server action: the server presigns a PUT (5 minutes), the browser
// sends the file straight to private storage, then a confirm action checks the stored object
// and writes the row. The browser's own checks only save a round trip; the server repeats them.
async function addAttachmentsViaStorage(paymentId: string, files: File[]): Promise<string[]> {
  const hashed = await Promise.all(files.map(async (file) => ({ file, fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256: await sha256Hex(file) })));
  checkAttachmentBatch(hashed, { state: "confirmed" }, []);
  const prepared = await call(prepareAttachmentUploads(paymentId, hashed.map(({ fileName, mimeType, sizeBytes }) => ({ fileName, mimeType, sizeBytes }))));
  try {
    await Promise.all(
      hashed.map(async ({ file }, i) => {
        const response = await fetch(prepared[i].url, { method: "PUT", headers: { "Content-Type": prepared[i].mimeType }, body: file });
        if (!response.ok) throw new KelabError("ATTACHMENT_UPLOAD_FAILED");
      }),
    );
  } catch (error) {
    throw error instanceof KelabError ? error : new KelabError("ATTACHMENT_UPLOAD_FAILED");
  }
  return call(
    confirmAttachmentUploads(
      paymentId,
      hashed.map(({ fileName, sizeBytes, sha256 }, i) => ({ attachmentId: prepared[i].attachmentId, fileName, mimeType: prepared[i].mimeType, sizeBytes, sha256 })),
    ),
  );
}

async function getAttachmentBlobViaStorage(attachmentId: string): Promise<Blob> {
  const { url } = await call(getAttachmentUrl(attachmentId));
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new KelabError("NETWORK");
  }
  if (!response.ok) throw new KelabError("ATTACHMENT_NOT_FOUND");
  return response.blob();
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
  addAttachments: addAttachmentsViaStorage,
  removeAttachment: (attachmentId, reason) => call(removeAttachment(attachmentId, reason)),
  getAttachmentBlob: getAttachmentBlobViaStorage,
  updateClub: (changes) => call(updateClub(changes)),
  resetDemo: () => Promise.reject(new KelabError("NOT_AVAILABLE")),
};
