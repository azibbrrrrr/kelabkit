import { test, expect } from "./fixtures";

test("7. language: EN shows English on key screens, BM brings Malay back", async ({ page }) => {
  await page.goto("/matriks/");
  await expect(page.getByRole("heading", { name: "Matriks Kutipan", level: 1 })).toBeVisible();

  const pill = page.getByRole("radiogroup", { name: "Bahasa / Language" }).first();
  await pill.getByRole("radio", { name: /English/ }).click();

  await expect(page.getByRole("heading", { name: "Collections matrix", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add member" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Payments/ }).first()).toBeVisible();

  // The choice survives navigation and covers the wizard and the payments ledger.
  await page.goto("/kutipan/baru/");
  await expect(page.getByRole("heading", { name: "Add collection", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await page.goto("/bayaran/");
  await expect(page.getByRole("heading", { name: "Payment records", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rekod Bayaran" })).toHaveCount(0);

  await page.getByRole("radiogroup", { name: "Bahasa / Language" }).first().getByRole("radio", { name: /Bahasa Melayu/ }).click();
  await expect(page.getByRole("heading", { name: "Rekod Bayaran", level: 1 })).toBeVisible();
  await page.goto("/matriks/");
  await expect(page.getByRole("heading", { name: "Matriks Kutipan", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah ahli" })).toBeVisible();
});
