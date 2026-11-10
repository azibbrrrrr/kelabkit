// Client helpers for the demo/real switch. The `kk_mode=demo` cookie is a preference, not a
// credential: it only selects the browser-local demo backend, which holds no real data.
// Real data is reachable only through the Neon Auth session, checked on the server.

export const MODE_COOKIE = "kk_mode";

export function enterDemo() {
  document.cookie = `${MODE_COOKIE}=demo; path=/; max-age=31536000; samesite=lax`;
}

export function leaveDemo() {
  document.cookie = `${MODE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
