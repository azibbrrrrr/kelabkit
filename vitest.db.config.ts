import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests: they talk to the Neon dev branch, so they are NOT part of `npm test`.
// Run with `npm run db:test`. Files run one at a time; each test makes its own fixtures.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // The real package throws outside a React Server build; tests run plain Node.
      "server-only": fileURLToPath(new URL("./db/tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["db/tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["db/tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
