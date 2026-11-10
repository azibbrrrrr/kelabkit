import { test, expect } from "./fixtures";

// Scenario 5 is the owner's key flow, so its trace is always kept (see the CI artifact).
test.use({ trace: "on" });

test("5. matrix inline: add a member and a collection, type amounts into the cell, reload, history", async ({ page }) => {
  await page.goto("/matriks/");
  await expect(page.getByRole("heading", { name: "Matriks Kutipan" })).toBeVisible();

  await page.getByRole("button", { name: "Tambah ahli" }).click();
  const member = page.getByRole("dialog", { name: "Tambah ahli" });
  await member.getByRole("textbox", { name: "Nama penuh" }).fill("Cikgu Ujian Matriks");
  await member.getByRole("button", { name: "Simpan ahli" }).click();
  await expect(member).toBeHidden();

  await page.getByRole("button", { name: "Tambah kutipan" }).click();
  const column = page.getByRole("dialog", { name: /Tambah kutipan/ });
  await column.getByRole("textbox", { name: "Nama kutipan" }).fill("Lajur Uji");
  await column.getByRole("textbox", { name: "Amaun seorang" }).fill("25");
  await column.getByRole("button", { name: "Tambah lajur" }).click();
  await expect(column).toBeHidden();

  const cell = page.getByRole("gridcell", { name: /^Cikgu Ujian Matriks, Lajur Uji/ });
  await expect(cell).toHaveAccessibleName(/RM0 \/ RM25 Belum Bayar/);

  // Type 10 straight into the focused cell: partial, RM15 still owing.
  await cell.focus();
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await expect(cell).toHaveAccessibleName(/RM10 \/ RM25 Sebahagian/);
  await cell.dblclick();
  const editor = page.getByRole("dialog", { name: /^Ubah sel: Cikgu Ujian Matriks/ });
  await expect(editor.getByRole("definition").filter({ hasText: "RM 15.00" })).toBeVisible(); // Baki
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();

  // Type the remaining RM15: paid.
  await cell.focus();
  await page.keyboard.type("15");
  await page.keyboard.press("Enter");
  await expect(cell).toHaveAccessibleName(/RM25 \/ RM25 Dibayar/);

  // Persisted: still paid after a reload.
  await page.reload();
  await expect(page.getByRole("gridcell", { name: /^Cikgu Ujian Matriks, Lajur Uji/ })).toHaveAccessibleName(/RM25 \/ RM25 Dibayar/);

  // Sejarah lists the two transactions, newest first.
  await page.getByRole("gridcell", { name: /^Cikgu Ujian Matriks, Lajur Uji/ }).dblclick();
  const history = page.getByRole("dialog", { name: /^Ubah sel: Cikgu Ujian Matriks/ });
  await expect(history.getByRole("tab", { name: "Sejarah (2)" })).toHaveAttribute("aria-selected", "true");
  const items = history.getByRole("tabpanel").getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("RM 15.00");
  await expect(items.nth(1)).toContainText("RM 10.00");
});
