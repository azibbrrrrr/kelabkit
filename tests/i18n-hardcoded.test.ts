import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Heuristic guard: a Bahasa Melayu UI word in a string literal or JSX text of a screen file means
// copy that bypassed t(). It is a tripwire, not a parser; it catches the common regression (someone
// types a new label inline) and nothing subtler.
//
// Escape hatches: end the line with `// i18n-ok` for intentional BM (data, sample names, the
// reminder message template).

const root = join(__dirname, "..");

const words = [
  "Simpan", "Batal", "Tutup", "Kembali", "Cari", "Tambah", "Ubah", "Padam", "Hapus", "Hantar", "Pilih", "Semua",
  "Belum", "Tiada", "Sebahagian", "Dibayar", "Lewat", "Sebab", "Tarikh", "Amaun", "Jumlah", "Baki", "Rekod",
  "Kutipan", "Bayaran", "Ahli", "Tetapan", "Laporan", "Peringatan", "Papan", "Pemuka", "Guru", "Kakitangan",
  "Muat", "Salin", "Bulan", "Tahun", "Terima", "Sahkan", "Kecualikan", "Arkib", "Teruskan", "Seterusnya",
  "Sebelumnya", "Nama", "Telefon", "Catatan", "Kaedah", "Tunai", "Pindahan", "Gagal", "Berjaya", "Sila",
  "Masukkan", "Perlu", "Wajib", "Pilihan", "Selesai", "Aktif", "Draf", "Hari", "Minggu", "Mula",
];
const wordRe = new RegExp(`(?<![A-Za-z])(?:${words.join("|")})(?![A-Za-z])`);

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return files(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const targets = [
  ...files("components").filter((f) => !f.startsWith("components/ui/")),
  ...["lib/themes.ts", "lib/attachments.ts"],
];

function offenders(source: string) {
  const out: string[] = [];
  const lines = source.split("\n");
  let inBlock = false;
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      if (line.includes("*/")) {
        inBlock = false;
        line = line.slice(line.indexOf("*/") + 2);
      } else return;
    }
    if (line.includes("i18n-ok")) return;
    line = line.replace(/\/\*.*?\*\//g, "");
    if (line.includes("/*")) {
      inBlock = true;
      line = line.slice(0, line.indexOf("/*"));
    }
    line = line.replace(/(^|[^:"'`])\/\/.*$/, "$1");
    if (/^\s*(import|export \{|export type)/.test(line)) return;
    const candidates: string[] = [];
    for (const m of line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`]*)`/g)) candidates.push(m[1] ?? m[2] ?? m[3] ?? "");
    for (const m of line.matchAll(/>([^<>{}]+)</g)) candidates.push(m[1]);
    // A bare JSX text line (wrapped copy on its own line).
    if (/^\s+[A-Z][^<>{}=;()]*$/.test(line) && !/^\s*(return|const|let|if|else|case|type|export)\b/.test(line)) candidates.push(line.trim());
    for (const c of candidates) {
      // Only prose: skip identifiers, class lists, paths, ids and single tokens used as keys.
      if (!/\s/.test(c.trim()) && !/^[A-Z][a-z]+…?$/.test(c.trim())) continue;
      if (/^[\w./:#\-[\]()%!?&*>_ ]+$/.test(c) && /(\bflex\b|\bgrid\b|\btext-|\bbg-|\bpx-|\bpy-|\bw-|\bh-|\bgap-|\bborder|\brounded)/.test(c)) continue;
      if (wordRe.test(c)) out.push(`${i + 1}: ${raw.trim()}`);
    }
  });
  return out;
}

describe("no hard-coded Bahasa Melayu UI copy outside t()", () => {
  for (const file of targets) {
    it(file, () => {
      const found = offenders(readFileSync(join(root, file), "utf8"));
      expect(found.length, `${file} has inline BM; use t() or mark the line // i18n-ok:\n${found.join("\n")}`).toBe(0);
    });
  }
});
