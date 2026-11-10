import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * Neon Auth (managed Better Auth), created on first use. `createNeonAuth` throws when the cookie
 * secret is missing, so building it at import time would break `next build` in any environment
 * without auth secrets. Callers check `isSignedInConfigured()` first and answer with a clear error.
 *
 * `lax` rather than the default `strict`: the Google redirect back to the app is a cross-site
 * navigation, and strict cookies would be dropped on it.
 */
export function getAuth(): NeonAuth {
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      sameSite: "lax",
    },
  });
  return instance;
}
