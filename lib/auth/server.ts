import { createNeonAuth } from "@neondatabase/auth/next/server";

// Neon Auth (managed Better Auth). `lax` rather than the default `strict`: the Google
// redirect back to the app is a cross-site navigation, and strict cookies would be dropped on it.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    sameSite: "lax",
  },
});
