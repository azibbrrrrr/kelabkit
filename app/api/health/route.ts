import { liveHealth } from "@/lib/server/health-live";

// Liveness plus the two backing stores. Public by design, so it returns status words and the
// build's commit sha only: no hosts, no counts, no error text.
export const dynamic = "force-dynamic";

export async function GET() {
  const { httpStatus, report } = await liveHealth();
  return Response.json(report, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}
