try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be exported (CI).
}
if (process.env.KELABKIT_DB_ENV !== "dev") {
  throw new Error("db:test writes to the database: set KELABKIT_DB_ENV=dev and point DATABASE_URL_UNPOOLED at the dev branch.");
}
