// Neon connection helpers for scripts and tests. The Pool speaks the Postgres wire
// protocol over websockets, which is what gives us interactive transactions (the HTTP
// driver cannot). `ws` supplies the WebSocket in Node; edge runtimes have their own.

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

/** Scripts: direct (unpooled) connection, as the owner. Reads the variable by name only. */
export function connectionString(name: "DATABASE_URL" | "DATABASE_URL_UNPOOLED" = "DATABASE_URL_UNPOOLED") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export function createPool(name: "DATABASE_URL" | "DATABASE_URL_UNPOOLED" = "DATABASE_URL_UNPOOLED", max = 4) {
  return new Pool({ connectionString: connectionString(name), max });
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export { schema };
