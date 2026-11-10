import { defineConfig } from "drizzle-kit";

// Migrations run as the database owner over the unpooled (direct) connection.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI or a shell that already exports the variables.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  // Neon Auth owns neon_auth; only public is ours.
  schemaFilter: ["public"],
});
