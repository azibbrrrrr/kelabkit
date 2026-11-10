import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared as SHA-256 digests with
 * timingSafeEqual so neither the secret's length nor a matching prefix leaks through timing.
 * An unset or blank secret rejects everything.
 */
export function isCronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret?.trim() || !authorization) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
