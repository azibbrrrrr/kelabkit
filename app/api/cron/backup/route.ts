import { isCronAuthorized } from "@/lib/server/cron-auth";
import { runBackup } from "@/lib/server/backup";

// Called daily by Vercel Cron (vercel.json). Authenticated by CRON_SECRET, not by a user session
// (proxy.ts lets /api/cron/* through for that reason). The response names counts and the object key,
// never row data.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runBackup();
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[kelabkit] backup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return Response.json({ ok: false, error: "backup_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
