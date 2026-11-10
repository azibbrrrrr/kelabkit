import "server-only";

import { pingDatabase } from "@/lib/db/with-club";
import { buildHealth, HEALTH_TIMEOUT_MS } from "@/lib/server/health";
import { pingStorage } from "@/lib/server/storage";

/** The real probes behind GET /api/health. Kept out of the route because only lib/server may import the db layer. */
export function liveHealth() {
  return buildHealth({
    database: () => pingDatabase(HEALTH_TIMEOUT_MS),
    storage: (signal) => pingStorage(signal),
  });
}
