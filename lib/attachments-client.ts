// Browser-only helpers for proof files: hashing and image compression. The rules live in
// lib/attachments.ts; this file only touches Web APIs.

import { COMPRESS_ABOVE_BYTES, MAX_IMAGE_EDGE } from "@/lib/attachments";

export async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Re-encodes a large JPEG, PNG or WebP as JPEG with the long edge capped at 2000px. Returns
 * the original when it is small enough, is HEIC (most browsers cannot decode it), cannot be
 * decoded, or would not get smaller. Transparent areas are flattened onto white.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_ABOVE_BYTES || !COMPRESSIBLE.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
