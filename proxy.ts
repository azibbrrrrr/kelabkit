import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { MODE_COOKIE } from "@/lib/auth/mode";

// Signed-out visitors go to /masuk. The demo (kk_mode=demo cookie) needs no account; it only
// ever reads browser-local sample data. Real data is protected where it lives: every server
// action re-checks the session, so this redirect is navigation, not the security boundary.
const signedIn = auth.middleware({ loginUrl: "/masuk/" });

export default function proxy(request: NextRequest) {
  // Server actions authenticate themselves and must not receive an HTML redirect.
  if (request.headers.has("Next-Action")) return NextResponse.next();
  // Returning from Google carries a verifier that the auth middleware must exchange, even with a stale demo cookie.
  const returningFromOAuth = request.nextUrl.searchParams.has("neon_auth_session_verifier");
  if (!returningFromOAuth && request.cookies.get(MODE_COOKIE)?.value === "demo") return NextResponse.next();
  return signedIn(request);
}

export const config = {
  // Everything except Next internals and files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|map|woff2?|txt|webmanifest)$).*)"],
};
