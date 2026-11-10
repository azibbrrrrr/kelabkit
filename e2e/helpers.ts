import { expect, type Page } from "@playwright/test";

// Helpers speak the way the treasurer does: Bahasa Melayu role and label queries, never test ids.

const MONTHS_LONG = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];

/** Current `YYYY-MM` on the Malaysian calendar (the app's own notion of "this month"). */
export function thisMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(0, 7);
}

export function addMonths(month: string, count: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const monthLong = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
export const monthShort = (month: string) => `${MONTHS_SHORT[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** Integer sen from text such as "RM 1,234.50". */
export function sen(text: string): number {
  const match = text.replace(/\s/g, "").match(/RM(-?[\d,]+(?:\.\d{1,2})?)/);
  if (!match) throw new Error(`No money amount in "${text}"`);
  return Math.round(Number(match[1].replace(/,/g, "")) * 100);
}

/** The value shown on a stat card on the collection detail page, e.g. "Dijangka" -> "RM 125.00". */
export function stat(page: Page, label: string) {
  return page.getByText(label, { exact: true }).first().locator("xpath=following-sibling::div[1]");
}

/** Picks a month in a MonthPicker trigger, walking the year buttons as needed. */
export async function pickMonth(page: Page, trigger: string, month: string) {
  await page.getByRole("button", { name: trigger }).click();
  const popover = page.locator("[data-radix-popper-content-wrapper]").last();
  const year = Number(month.slice(0, 4));
  for (let i = 0; i < 6; i++) {
    const shown = Number(await popover.locator("[aria-live=polite]").innerText());
    if (shown === year) break;
    await popover.getByRole("button", { name: shown < year ? "Tahun seterusnya" : "Tahun sebelumnya" }).click();
  }
  await popover.getByRole("button", { name: monthLong(month) }).click();
  await expect(page.locator("[data-radix-popper-content-wrapper]")).toHaveCount(0);
}

export type WizardMember = { name: string; amount?: string; exemptReason?: string };

/** Walks the Tambah Kutipan wizard and lands on the new collection's detail page. */
export async function createCollection(
  page: Page,
  options: {
    name: string;
    type?: "Sekali bayar" | "Bulanan" | "Sumbangan sukarela";
    amount?: string;
    startMonth?: string;
    endMonth?: string;
    members: WizardMember[];
  },
) {
  await page.goto("/kutipan/baru/");
  await page.getByRole("textbox", { name: "Nama kutipan" }).fill(options.name);
  if (options.type && options.type !== "Sekali bayar") await page.getByRole("radio", { name: new RegExp(`^${options.type}`) }).click();
  if (options.amount) await page.getByRole("textbox", { name: /^Amaun (seorang|sebulan) \(asal\)$/ }).fill(options.amount);
  if (options.startMonth) await pickMonth(page, "Bulan mula", options.startMonth);
  if (options.endMonth) await pickMonth(page, "Bulan akhir", options.endMonth);
  await page.getByRole("button", { name: "Seterusnya" }).click();

  await page.getByRole("radio", { name: /^Ahli terpilih sahaja/ }).click();
  for (const member of options.members) {
    await page.getByRole("checkbox", { name: new RegExp(`^${member.name}`) }).check();
    if (member.amount) await page.getByRole("textbox", { name: new RegExp(`^Amaun (sebulan )?untuk ${member.name}$`) }).fill(member.amount);
    if (member.exemptReason) {
      await page.getByRole("switch", { name: `Kecualikan ${member.name}` }).click();
      await page.getByRole("textbox", { name: `Sebab pengecualian untuk ${member.name}` }).fill(member.exemptReason);
    }
  }
  await page.getByRole("button", { name: "Seterusnya" }).click();
  await page.getByRole("button", { name: "Cipta kutipan" }).click();
  await expect(page).toHaveURL(/\/kutipan\/[^/]+\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(options.name);
}

/** Records a payment from the editor dialog opened by `open` and waits for it to close. */
export async function recordInDialog(page: Page, amount: string) {
  const dialog = page.getByRole("dialog", { name: "Rekod bayaran" });
  await dialog.getByRole("textbox", { name: /^Amaun (diterima|sumbangan)$/ }).fill(amount);
  await dialog.getByRole("button", { name: /^Simpan/ }).click();
  await expect(dialog).toBeHidden();
}

/** Opens a member's payment row on the collection detail page (the "Rekod" or "Butiran" button). */
export function rowOf(page: Page, member: string) {
  return page.getByRole("main").getByRole("row", { name: new RegExp(member) });
}

/**
 * Records one payment from Rekod Bayaran (the full-page flow): pick the member, tick the charges
 * (future months sit behind "bayar awal" and are only ticked when named), pay in full or a total.
 */
export async function payCharges(page: Page, member: string, collection: string, months: string[], options: { total?: string } = {}) {
  await page.goto("/bayaran/baru/");
  await page.getByRole("combobox", { name: "Cari ahli", exact: true }).fill(member);
  await page.getByRole("option", { name: new RegExp(member) }).click();
  await expect(page.getByRole("heading", { name: /Caj yang dibayar/ })).toBeVisible();
  const future = page.getByRole("button", { name: /^Akan datang: bayar awal/ });
  for (const month of months) {
    const box = page.getByRole("checkbox", { name: `${collection} · ${monthShort(month)}` });
    if (!(await box.isVisible()) && (await future.isVisible())) await future.click();
    await box.check();
  }
  if (options.total) {
    await page.getByRole("radio", { name: /Masukkan jumlah diterima/ }).click();
    await page.getByRole("textbox", { name: "Jumlah diterima untuk caj dipilih" }).fill(options.total);
  }
  await page.getByRole("button", { name: /^Simpan RM/ }).click();
  await expect(page.getByText(/direkod$/).first()).toBeVisible();
}
