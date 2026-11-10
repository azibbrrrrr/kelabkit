import { parseCsv } from "@/lib/csv";
import type { MemberCategory } from "@/lib/types";

// Bulk member import from CSV: the template the treasurer downloads and the parser that
// reads it back. Pure functions; the dialog owns the UI. Nothing is dropped silently:
// every skipped or changed row produces an issue.

export const TEMPLATE_FILENAME = "templat-ahli-kelabkit.csv";
export const TEMPLATE_HEADER = ["nama", "kategori", "telefon"] as const;
export const ACCEPTED_CATEGORIES = "guru, kakitangan, lain";
export const MIN_PHONE_DIGITS = 9;

const EXAMPLES: { name: string; category: MemberCategory; phone: string }[] = [
  { name: "Cikgu Contoh Satu", category: "guru", phone: "012-345 6789" },
  { name: "Encik Contoh Dua", category: "kakitangan", phone: "" },
];
const EXAMPLE_NAMES = new Set(EXAMPLES.map((example) => example.name.toLowerCase()));

const HEADER_ALIASES = {
  name: ["nama", "name", "nama penuh", "full name"],
  category: ["kategori", "category"],
  phone: ["telefon", "no telefon", "no. telefon", "no tel", "no. tel", "tel", "phone", "phone number", "nombor telefon"],
} as const;

const CATEGORY_ALIASES: Record<string, MemberCategory> = {
  guru: "guru",
  teacher: "guru",
  cikgu: "guru",
  kakitangan: "kakitangan",
  staf: "kakitangan",
  staff: "kakitangan",
  "kakitangan sokongan": "kakitangan",
  lain: "lain",
  "lain-lain": "lain",
  "lain lain": "lain",
  lainlain: "lain",
  other: "lain",
  others: "lain",
};

export type MemberImportRow = {
  /** Row number as the treasurer sees it in the spreadsheet (header is row 1). */
  line: number;
  name: string;
  category: MemberCategory | null;
  /** The kategori cell as typed when it was not recognised; the category is then null. */
  invalidCategory: string | null;
  phone: string;
  /** Unchanged template example row; the dialog leaves these out. */
  isExample: boolean;
};

export type ImportIssue = {
  /** Spreadsheet row, or null for a whole-file issue. */
  line: number | null;
  kind: "header" | "unknown-column" | "blank-name" | "example" | "category" | "phone";
  /** "error" stops the import; "skipped" row left out; "warning" row kept. */
  level: "error" | "skipped" | "warning";
  message: string;
};

export function buildMemberTemplate(): string {
  const lines = [TEMPLATE_HEADER.join(","), ...EXAMPLES.map((e) => [e.name, e.category, e.phone].join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function parseCategory(value: string): MemberCategory | null {
  return CATEGORY_ALIASES[value.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "").length;
}

export const invalidCategoryMessage = (value: string) =>
  `Kategori "${value}" tidak dikenali. Guna: ${ACCEPTED_CATEGORIES}. Dibiarkan kosong; pilih kategori di bawah.`;
export const invalidPhoneMessage = (phone: string) =>
  `No. telefon "${phone}" terlalu pendek (sekurang-kurangnya ${MIN_PHONE_DIGITS} digit). Contoh: 012-345 6789.`;

const normaliseHeader = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, " ");
const cleanName = (name: string) => name.replace(/\s+/g, " ").trim();

/** Excel in a Malay locale saves with semicolons; pick whichever the first line uses more. */
function guessDelimiter(text: string) {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
}

const headerError = (message: string): ImportIssue => ({ line: null, kind: "header", level: "error", message });
const EXPECTED = `Pengepala yang dijangka: nama, kategori, telefon (kategori dan telefon pilihan).`;

export function parseMemberCsv(text: string, options: { defaultCategory?: MemberCategory | null } = {}): { rows: MemberImportRow[]; issues: ImportIssue[] } {
  const table = parseCsv(text, guessDelimiter(text));
  if (!table.length) return { rows: [], issues: [headerError(`Fail CSV kosong. ${EXPECTED}`)] };

  const header = table[0].map(normaliseHeader);
  const indexOf = (names: readonly string[]) => header.findIndex((cell) => names.includes(cell));
  const nameAt = indexOf(HEADER_ALIASES.name);
  const categoryAt = indexOf(HEADER_ALIASES.category);
  const phoneAt = indexOf(HEADER_ALIASES.phone);

  if (nameAt < 0) {
    const found = table[0].map((cell) => `"${cell.trim()}"`).filter((cell) => cell !== '""').join(", ");
    return { rows: [], issues: [headerError(`Pengepala tidak dikenali (${found}). ${EXPECTED} Muat turun templat CSV untuk format yang betul.`)] };
  }

  const issues: ImportIssue[] = [];
  header.forEach((cell, index) => {
    if (cell !== "" && index !== nameAt && index !== categoryAt && index !== phoneAt) {
      issues.push({ line: 1, kind: "unknown-column", level: "warning", message: `Lajur "${table[0][index].trim()}" tidak dikenali dan diabaikan. ${EXPECTED}` });
    }
  });

  const rows: MemberImportRow[] = [];
  table.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const name = cleanName(cells[nameAt] ?? "");
    const rawCategory = categoryAt >= 0 ? (cells[categoryAt] ?? "").trim() : "";
    const phone = phoneAt >= 0 ? (cells[phoneAt] ?? "").trim() : "";
    if (!name) {
      issues.push({ line, kind: "blank-name", level: "skipped", message: `Nama kosong; baris dilangkau${rawCategory || phone ? ` (${[rawCategory, phone].filter(Boolean).join(", ")})` : ""}.` });
      return;
    }
    if (EXAMPLE_NAMES.has(name.toLowerCase())) {
      issues.push({ line, kind: "example", level: "skipped", message: `"${name}" ialah baris contoh daripada templat; diabaikan.` });
      rows.push({ line, name, category: null, invalidCategory: null, phone, isExample: true });
      return;
    }
    let category: MemberCategory | null = options.defaultCategory ?? null;
    let invalidCategory: string | null = null;
    if (rawCategory) {
      const parsed = parseCategory(rawCategory);
      category = parsed;
      if (!parsed) {
        invalidCategory = rawCategory;
        issues.push({ line, kind: "category", level: "warning", message: invalidCategoryMessage(rawCategory) });
      }
    }
    if (phone && phoneDigits(phone) < MIN_PHONE_DIGITS) issues.push({ line, kind: "phone", level: "warning", message: invalidPhoneMessage(phone) });
    rows.push({ line, name, category, invalidCategory, phone, isExample: false });
  });
  return { rows, issues };
}
