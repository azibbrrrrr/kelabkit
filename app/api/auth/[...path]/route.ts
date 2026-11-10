import { getAuth } from "@/lib/auth/server";
import { logMissingEnv, missingSignedInEnv } from "@/lib/server/env";

type Ctx = { params: Promise<{ path: string[] }> };

// Resolved per request so `next build` needs no auth secrets. Without them the answer is a clear 503.
function route(method: "GET" | "POST") {
  return (request: Request, ctx: Ctx) => {
    const missing = missingSignedInEnv();
    if (missing.length > 0) {
      logMissingEnv(missing, "/api/auth");
      return Response.json({ error: "Auth not configured" }, { status: 503 });
    }
    return getAuth().handler()[method](request, ctx);
  };
}

export const GET = route("GET");
export const POST = route("POST");
