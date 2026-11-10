import "server-only";

import { pingDatabase } from "@/lib/db/with-club";
import { buildHealth, HEALTH_TIMEOUT_MS, memoizeHealth } from "@/lib/server/health";
import { pingStorage } from "@/lib/server/storage";

// At most one probe round per instance every 5 s, however hard the route is hit.
export const HEALTH_CACHE_MS = 5000;

/** The real probes behind GET /api/health. Kept out of the route because only lib/server may import the db layer. */
export const liveHealth = memoizeHealth(
  () =>
    buildHealth({
      database: () => pingDatabase(HEALTH_TIMEOUT_MS),
      storage: (signal) => pingStorage(signal),
    }),
  HEALTH_CACHE_MS,
);
