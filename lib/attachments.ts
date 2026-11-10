// Proof-of-payment rules, pure so the demo backend and the future server share one
// definition and tests need no browser. Callers pass metadata only (name, MIME, size,
// SHA-256); bytes never enter this file.

import { KelabError } from "@/lib/errors";
import type { Attachment, PaymentState, Snapshot } from "@/lib/types";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;
/** Images above this are re-encoded in the browser before they are stored. */
export const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2000;

export const DEMO_FILE_NOTICE = "Fail disimpan dalam pelayar ini sahaja (demo).";
export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  pdf: "application/pdf",
};

/** MIME types that name the same format collapse to one, so image/heif matches a .heic file. */
const canonicalMime = (mime: string) => {
  const value = mime.toLowerCase().split(";")[0].trim();
  if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
  if (value === "image/heif") return "image/heic";
  return value;
};

const ALLOWED_MIME = new Set(Object.values(BY_EXTENSION));

/**
 * The MIME type to store, or null when the file is not an accepted proof type. Both the
 * extension and the browser-reported MIME must be acceptable and agree; an empty MIME
 * (common for .heic) falls back to the extension.
 */
export function resolveProofMime(fileName: string, reportedMime: string): string | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const fromExtension = BY_EXTENSION[extension];
  if (!fromExtension) return null;
  if (!reportedMime) return fromExtension;
  const reported = canonicalMime(reportedMime);
  if (!ALLOWED_MIME.has(reported) || reported !== fromExtension) return null;
  return fromExtension;
}

export const isImageMime = (mime: string) => mime.startsWith("image/");
export const isHeicMime = (mime: string) => mime === "image/heic" || mime === "image/heif";

export type ProofCandidate = { fileName: string; mimeType: string; sizeBytes: number };

/** What can be known before reading the bytes: type, emptiness, size. Throws KelabError. */
export function checkProofFile(file: ProofCandidate): string {
  const mime = resolveProofMime(file.fileName, file.mimeType);
  if (!mime) throw new KelabError("ATTACHMENT_TYPE", file.fileName);
  if (file.sizeBytes <= 0) throw new KelabError("ATTACHMENT_EMPTY", file.fileName);
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) throw new KelabError("ATTACHMENT_TOO_LARGE", file.fileName);
  return mime;
}

export const activeAttachments = (attachments: Attachment[]) => attachments.filter((row) => row.removedAt === null);
export const attachmentsOf = (data: Pick<Snapshot, "attachments">, paymentId: string) =>
  data.attachments.filter((row) => row.paymentId === paymentId);

/**
 * Checks a batch against the payment: reversed payments take nothing new, every file must
 * pass `checkProofFile`, the active total stays within the limit and no hash repeats (within
 * the batch or against the payment's active files). All or nothing: the first problem throws.
 * Returns the canonical MIME of each file, in order.
 */
export function checkAttachmentBatch(
  batch: (ProofCandidate & { sha256: string })[],
  payment: { state: PaymentState },
  existing: Attachment[],
): string[] {
  if (payment.state === "reversed") throw new KelabError("ATTACHMENT_PAYMENT_REVERSED");
  const active = activeAttachments(existing);
  const hashes = new Set(active.map((row) => row.sha256));
  const mimes = batch.map((file) => {
    const mime = checkProofFile(file);
    if (hashes.has(file.sha256)) throw new KelabError("ATTACHMENT_DUPLICATE", file.fileName);
    hashes.add(file.sha256);
    return mime;
  });
  if (active.length + batch.length > MAX_ACTIVE_ATTACHMENTS) throw new KelabError("ATTACHMENT_LIMIT");
  return mimes;
}

/** "1.4 MB", "820 KB": for file rows. */
export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
