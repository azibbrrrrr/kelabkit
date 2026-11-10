import { test, expect } from "./fixtures";
import { sen } from "./helpers";

// Runs in the 390x844 project only (see playwright.config.ts).
test("6. mobile: search a member, open the card, record a partial payment from the bottom sheet", async ({ page }) => {
  await page.goto("/matriks/");
  await page.getByRole("searchbox", { name: "Cari ahli…" }).fill("Amir");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Cikgu Amir Danish" }) });
  await expect(page.getByRole("listitem")).toHaveCount(1);

  const balanceOf = async () => sen(await card.getByText(/^Baki RM/).innerText());
  const before = await balanceOf();

  await card.getByRole("button", { name: /^Hadiah Persaraan Puan Rosnah RM 0.00 \/ RM 20.00 Belum Bayar/ }).click();
  const sheet = page.getByRole("dialog", { name: /^Ubah sel: Cikgu Amir Danish/ });
  await expect(sheet.getByRole("definition").filter({ hasText: "RM 20.00" }).first()).toBeVisible();
  await sheet.getByRole("textbox", { name: "Amaun diterima" }).fill("8");
  await expect(sheet.getByText(/Selepas simpan: baki RM 12.00/)).toBeVisible();
  await sheet.getByRole("button", { name: /^Simpan/ }).click();
  await expect(sheet).toBeHidden();

  await expect(card.getByRole("button", { name: /^Hadiah Persaraan Puan Rosnah RM 8.00 \/ RM 20.00 Sebahagian/ })).toBeVisible();
  await expect.poll(balanceOf).toBe(before - 800);
});
