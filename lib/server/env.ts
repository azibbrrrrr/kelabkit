import { DB_CONNECTION_ENV } from "@/lib/db/config";

/** Variables signed-in mode needs. Demo mode needs none of them. Names only: values never leave process.env. */
export const SIGNED_IN_ENV = [DB_CONNECTION_ENV, "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"] as const;

/** Variables proof storage needs (S3-compatible Neon Object Storage). Optional: without them sign-in works and attachments say storage is not set up. */
export const STORAGE_ENV = [
  "NEON_STORAGE_ENDPOINT",
  "NEON_STORAGE_REGION",
  "NEON_STORAGE_BUCKET",
  "NEON_STORAGE_ACCESS_KEY_ID",
  "NEON_STORAGE_SECRET_ACCESS_KEY",
] as const;

export function missingStorageEnv(env: Record<string, string | undefined> = process.env): string[] {
  return STORAGE_ENV.filter((name) => !env[name]?.trim());
}

/** Neon Auth rejects a shorter cookie secret. */
export const COOKIE_SECRET_MIN = 32;

/** Names of the required variables that are unset, blank, or (for the cookie secret) too short. */
export function missingSignedInEnv(env: Record<string, string | undefined> = process.env): string[] {
  return SIGNED_IN_ENV.filter((name) => {
    const value = env[name]?.trim();
    if (!value) return true;
    return name === "NEON_AUTH_COOKIE_SECRET" && value.length < COOKIE_SECRET_MIN;
  });
}

export function isSignedInConfigured(env?: Record<string, string | undefined>): boolean {
  return missingSignedInEnv(env).length === 0;
}

const logged = new Set<string>();

/** Logs the missing variable names once per process per distinct set. Never logs values. */
export function logMissingEnv(missing: string[], where: string) {
  const key = `${where}:${missing.join(",")}`;
  if (logged.has(key)) return;
  logged.add(key);
  console.error(`[kelabkit] Signed-in mode is not configured (${where}). Missing or invalid environment variables: ${missing.join(", ")}`);
}
