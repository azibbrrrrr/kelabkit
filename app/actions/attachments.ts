"use server";

import type { ProofCandidate } from "@/lib/attachments";
import { act, actMutation } from "@/lib/server/act";
import * as service from "@/lib/server/service";

// The club comes from the session (act), never from an argument. The bytes do not pass through
// these actions: the browser PUTs them to a presigned URL, so no action body limit applies.
export async function prepareAttachmentUploads(paymentId: string, files: ProofCandidate[]) {
  return act((ctx) => service.prepareAttachmentUploads(ctx, paymentId, files));
}
export async function confirmAttachmentUploads(paymentId: string, items: service.ProofMeta[]) {
  return actMutation((ctx) => service.confirmAttachmentUploads(ctx, paymentId, items));
}
export async function removeAttachment(attachmentId: string, reason: string) {
  return actMutation((ctx) => service.removeAttachment(ctx, attachmentId, reason));
}
export async function getAttachmentUrl(attachmentId: string) {
  return act((ctx) => service.attachmentDownloadUrl(ctx, attachmentId));
}
