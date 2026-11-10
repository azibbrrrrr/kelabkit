import "server-only";

// Private object storage for payment proof (Neon Object Storage, S3-compatible, path-style).
// The client is created on first use, like getAuth(), so `next build` and CI need no secrets;
// without the variables every call answers ATTACHMENT_STORAGE_UNAVAILABLE. Keys are built by
// attachmentKey() from the session's club; nothing here accepts a key from a client.

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PRESIGN_SECONDS } from "@/lib/attachments";
import { KelabError } from "@/lib/errors";
import { missingStorageEnv, logMissingEnv } from "@/lib/server/env";

const globalForStorage = globalThis as unknown as { __kelabS3?: { client: S3Client; bucket: string } };

function storage() {
  if (globalForStorage.__kelabS3) return globalForStorage.__kelabS3;
  const missing = missingStorageEnv();
  if (missing.length) {
    logMissingEnv(missing, "object storage");
    throw new KelabError("ATTACHMENT_STORAGE_UNAVAILABLE");
  }
  const env = process.env;
  const client = new S3Client({
    endpoint: env.NEON_STORAGE_ENDPOINT,
    region: env.NEON_STORAGE_REGION,
    forcePathStyle: true,
    // Neon's S3 API does not take the SDK's default CRC32 trailer.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID!, secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY! },
  });
  return (globalForStorage.__kelabS3 = { client, bucket: env.NEON_STORAGE_BUCKET! });
}

/** Link for the browser to PUT the bytes. Content-Length is signed, so a different size is refused by the store. */
export function presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<string> {
  const { client, bucket } = storage();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes }), {
    expiresIn: PRESIGN_SECONDS,
  });
}

/** Link to read one object. The type is forced to the one recorded in the database. */
export function presignDownload(key: string, mimeType: string): Promise<string> {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: mimeType, ResponseContentDisposition: "inline" }), {
    expiresIn: PRESIGN_SECONDS,
  });
}

/** Size and type the store holds for a key, or null when there is no such object. */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
  const { client, bucket } = storage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { sizeBytes: head.ContentLength ?? -1, contentType: (head.ContentType ?? "").toLowerCase() };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
