import { test, expect } from "./fixtures";
import { addMonths, createCollection, monthLong, payCharges, recordInDialog, rowOf, sen, stat, thisMonth } from "./helpers";

test.describe("treasurer flows (demo backend)", () => {
  test("1. jamuan: subset, overrides, exemption, full and partial payments", async ({ page }) => {
    await createCollection(page, {
      name: "Jamuan Uji",
      amount: "25",
      members: [
        { name: "Cikgu Aina Sofea" },
        { name: "Cikgu Amir Danish", amount: "30" },
        { name: "Cikgu Chong Kah Yan", amount: "20" },
        { name: "Cikgu Farah Hanim", exemptReason: "Cuti tanpa gaji" },
        { name: "Cikgu Faris Hakim" },
        { name: "Cikgu Hafiz Rahman" },
      ],
    });

    // Expected = 25 + 30 + 20 + 25 + 25 (the exempt member is not charged) = RM 125.
    await expect(stat(page, "Dijangka")).toHaveText("RM 125.00");
    await expect(stat(page, "Diterima")).toHaveText("RM 0.00");
    await expect(stat(page, "Baki semasa")).toHaveText("RM 125.00");
    await expect(rowOf(page, "Cikgu Farah Hanim")).toContainText("Dikecualikan");

    const payments: [string, string][] = [
      ["Cikgu Aina Sofea", "25"], // full
      ["Cikgu Amir Danish", "30"], // full, at the override
      ["Cikgu Chong Kah Yan", "8"], // partial of 20
      ["Cikgu Faris Hakim", "10"], // partial of 25
    ];
    for (const [member, amount] of payments) {
      await rowOf(page, member).getByRole("button", { name: "Rekod" }).click();
      await recordInDialog(page, amount);
    }

    const received = 25 + 30 + 8 + 10;
    await expect(stat(page, "Diterima")).toHaveText("RM 73.00");
    await expect(stat(page, "Baki semasa")).toHaveText("RM 52.00");
    expect(sen(await stat(page, "Dijangka").innerText()) - sen(await stat(page, "Diterima").innerText())).toBe(sen(await stat(page, "Baki semasa").innerText()));
    expect(sen(await stat(page, "Diterima").innerText())).toBe(received * 100);

    await expect(rowOf(page, "Cikgu Aina Sofea")).toContainText("Dibayar");
    await expect(rowOf(page, "Cikgu Chong Kah Yan")).toContainText("RM 12.00"); // 20 - 8
    await expect(rowOf(page, "Cikgu Chong Kah Yan")).toContainText("Sebahagian");
    await expect(rowOf(page, "Cikgu Hafiz Rahman")).toContainText("Belum Bayar");
    for (const count of ["Dibayar 2", "Sebahagian 2", "Belum bayar 1", "Dikecualikan 1"]) await expect(page.getByText(count, { exact: true }).first()).toBeVisible();
  });

  test("2. monthly yuran: separate months, advance payment, future months are not overdue", async ({ page }) => {
    const now = thisMonth();
    const first = addMonths(now, -2);
    const second = addMonths(now, -1);
    const advance = addMonths(now, 4);
    await createCollection(page, {
      name: "Yuran Uji",
      type: "Bulanan",
      amount: "10",
      startMonth: first,
      endMonth: addMonths(now, 9),
      members: [{ name: "Cikgu Aina Sofea" }],
    });
    // 12 months at RM10 for one member.
    await expect(stat(page, "Dijangka")).toHaveText("RM 10.00"); // the month in view (this month)

    await payCharges(page, "Cikgu Aina Sofea", "Yuran Uji", [first]);
    await payCharges(page, "Cikgu Aina Sofea", "Yuran Uji", [second]);
    await payCharges(page, "Cikgu Aina Sofea", "Yuran Uji", [advance]);

    await page.goto("/kutipan/");
    await page.getByRole("link", { name: /Yuran Uji/ }).first().click();
    await page.getByRole("combobox", { name: /Paparan bulan/ }).click();
    await page.getByRole("option", { name: /Semua bulan/ }).click();

    // Paid: first, second and the advance month = RM 30. Future unpaid = 9 - 1 = 8 months = RM 80.
    await expect(stat(page, "Diterima")).toHaveText("RM 30.00");
    await expect(stat(page, "Akan datang")).toHaveText("RM 80.00");
    // Current balance counts only months up to and including this one: this month, RM 10.
    await expect(stat(page, "Baki semasa")).toHaveText("RM 10.00");

    // A future month shown on its own: "Akan Datang", nothing due, nothing overdue.
    await page.getByRole("combobox", { name: /Paparan bulan/ }).click();
    await page.getByRole("option", { name: new RegExp(`^${monthLong(addMonths(now, 1))} \\(akan datang\\)`) }).click();
    await expect(rowOf(page, "Cikgu Aina Sofea")).toContainText("Akan Datang");
    await expect(rowOf(page, "Cikgu Aina Sofea")).not.toContainText("Lewat");
    await expect(page.getByText("Tiada caj lewat")).toBeVisible();
    await expect(stat(page, "Baki semasa")).toHaveText("RM 0.00");
  });

  test("3. voluntary: contributions of different amounts never create a balance", async ({ page }) => {
    await createCollection(page, {
      name: "Sumbangan Uji",
      type: "Sumbangan sukarela",
      members: [{ name: "Cikgu Aina Sofea" }, { name: "Cikgu Amir Danish" }, { name: "Cikgu Chong Kah Yan" }],
    });
    await expect(stat(page, "Jumlah terkumpul")).toHaveText("RM 0.00");

    for (const [member, amount] of [["Cikgu Aina Sofea", "5"], ["Cikgu Amir Danish", "12.50"]]) {
      await rowOf(page, member).getByRole("button", { name: "Rekod" }).click();
      await recordInDialog(page, amount);
    }
    await expect(stat(page, "Jumlah terkumpul")).toHaveText("RM 17.50");
    await expect(stat(page, "Penyumbang")).toHaveText("2");

    // Nobody owes anything, including the member who gave nothing.
    await expect(page.getByRole("main")).not.toContainText(/Lewat|Belum Bayar|Baki/);
    await expect(rowOf(page, "Cikgu Chong Kah Yan")).toContainText("RM 0.00");
    await expect(page.getByText("Tiada hutang untuk sumbangan sukarela")).toBeVisible();
  });

  test("4. reversal: the payment stays in history as Dibatalkan and the audit log records the reason", async ({ page }) => {
    await createCollection(page, { name: "Jamuan Batal", amount: "25", members: [{ name: "Cikgu Aina Sofea" }] });
    await rowOf(page, "Cikgu Aina Sofea").getByRole("button", { name: "Rekod" }).click();
    await recordInDialog(page, "10");
    await expect(stat(page, "Diterima")).toHaveText("RM 10.00");
    await expect(stat(page, "Baki semasa")).toHaveText("RM 15.00");

    await rowOf(page, "Cikgu Aina Sofea").getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: "Rekod bayaran" });
    await dialog.getByRole("tab", { name: /Sejarah/ }).click();
    await dialog.getByRole("button", { name: "Batalkan bayaran…" }).click();
    const confirm = page.getByRole("dialog", { name: "Batalkan bayaran" });
    await confirm.getByRole("textbox", { name: "Sebab" }).fill("Silap amaun");
    await confirm.getByRole("button", { name: "Batalkan bayaran" }).click();
    await expect(confirm).toBeHidden();

    // History keeps the original payment, marked and explained; it is not deleted.
    await expect(dialog.getByText("Dibatalkan", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Silap amaun/)).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Sejarah (1)" })).toBeVisible();
    await dialog.getByRole("button", { name: "Tutup" }).click();

    // Totals are back to what they were before the payment.
    await expect(stat(page, "Diterima")).toHaveText("RM 0.00");
    await expect(stat(page, "Baki semasa")).toHaveText("RM 25.00");

    // The payments ledger lists it under Dibatalkan with its reason; the audit log has the entry.
    await page.goto("/bayaran/");
    await page.getByRole("tab", { name: /^Dibatalkan/ }).click();
    await expect(page.getByRole("main")).toContainText("Cikgu Aina Sofea");
    await page.goto("/tetapan/");
    await expect(page.getByRole("heading", { name: "Log audit" })).toBeVisible();
    const audit = page.getByRole("main");
    await expect(audit).toContainText("Bayaran RM 10.00 daripada Cikgu Aina Sofea dibatalkan");
    await expect(audit).toContainText("Sebab: Silap amaun");
  });
});
