import { test as base, expect } from "@playwright/test";

// Every test starts in Demo mode on a fresh seed: the kk_mode=demo cookie reaches the app without
// an account, and the two localStorage keys are cleared before any page script runs. The seed is
// rebuilt relative to the day the demo is first opened, so tests never depend on a calendar date.
export const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    await context.addCookies([{ name: "kk_mode", value: "demo", url: baseURL! }]);
    await page.addInitScript(() => {
      // Only on the first document of the test: reloads must keep the data they are proving.
      if (sessionStorage.getItem("e2e-fresh")) return;
      sessionStorage.setItem("e2e-fresh", "1");
      localStorage.removeItem("kelabkit-demo-v1");
      localStorage.removeItem("kelabkit-prefs-v1");
    });
    await use(page);
  },
});

export { expect };

/** Integer sen from text such as "RM 1,234.50" or "RM25.00". */
export function sen(text: string): number {
  const match = text.replace(/\s/g, "").match(/RM(-?[\d,]+(?:\.\d{1,2})?)/);
  if (!match) throw new Error(`No money amount in "${text}"`);
  return Math.round(Number(match[1].replace(/,/g, "")) * 100);
}
