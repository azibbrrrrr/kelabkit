import { assertDbTestEnv } from "./guard";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be exported (CI).
}
// Also enforced once per run in global-setup.ts; kept here so a single file run is guarded too.
assertDbTestEnv(process.env);
