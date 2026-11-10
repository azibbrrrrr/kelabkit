import { defineConfig, devices } from "@playwright/test";

// Acceptance scenarios run against the Demo backend (browser localStorage), so they need no
// database or secrets. In CI the app is built and served; locally an already-running server on
// the baseURL is reused (start one with `npm run dev`, or point E2E_BASE_URL at it).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ci = Boolean(process.env.CI);
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ms-MY",
    timezoneId: "Asia/Kuala_Lumpur",
  },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: ci ? `npm run build && npm start -- -p ${port}` : `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 300_000,
  },
});
