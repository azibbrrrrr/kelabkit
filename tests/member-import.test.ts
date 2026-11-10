import { describe, expect, it } from "vitest";
import { buildMemberTemplate, parseMemberCsv } from "@/lib/member-import";

const kinds = (text: string) => parseMemberCsv(text).issues.map((i) => `${i.line}:${i.kind}`);

describe("buildMemberTemplate", () => {
  it("starts with a BOM, uses CRLF and the expected header", () => {
    const t = buildMemberTemplate();
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t.slice(1).split("\r\n")[0]).toBe("nama,kategori,telefon");
    expect(t.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("parses back to the two example rows, flagged as examples", () => {
    const { rows, issues } = parseMemberCsv(buildMemberTemplate());
    expect(rows.map((r) => [r.name, r.isExample])).toEqual([["Cikgu Contoh Satu", true], ["Encik Contoh Dua", true]]);
    expect(issues.every((i) => i.kind === "example")).toBe(true);
  });
});

describe("parseMemberCsv", () => {
  it("accepts header aliases and category synonyms, case-insensitively", () => {
    const { rows, issues } = parseMemberCsv("Name,Category,No Telefon\nAina,STAF,0123456789\nBudi,Lain-lain,\nCati,Guru,");
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.category)).toEqual(["kakitangan", "lain", "guru"]);
  });
  it("reads semicolon files with a BOM", () => {
    const { rows } = parseMemberCsv("﻿nama;kategori;telefon\r\nAina;guru;012-345 6789\r\n");
    expect(rows).toMatchObject([{ name: "Aina", category: "guru", phone: "012-345 6789" }]);
  });
  it("warns on an invalid kategori, keeps the row with no category", () => {
    const { rows, issues } = parseMemberCsv("nama,kategori\nAina,pelajar");
    expect(rows[0]).toMatchObject({ category: null, invalidCategory: "pelajar" });
    expect(issues[0]).toMatchObject({ line: 2, kind: "category", level: "warning" });
    expect(issues[0].message).toContain("pelajar");
    expect(issues[0].message).toContain("guru, kakitangan, lain");
  });
  it("uses the default category only when the cell is empty", () => {
    const { rows } = parseMemberCsv("nama,kategori\nA,\nB,salah", { defaultCategory: "guru" });
    expect(rows.map((r) => r.category)).toEqual(["guru", null]);
  });
  it("warns on a phone with fewer than 9 digits", () => {
    expect(kinds("nama,telefon\nAina,012-345\nBudi,012-345 6789")).toEqual(["2:phone"]);
  });
  it("skips a blank name with a note", () => {
    const { rows, issues } = parseMemberCsv("nama,kategori\n,guru\nAina,guru");
    expect(rows).toHaveLength(1);
    expect(issues).toMatchObject([{ line: 2, kind: "blank-name", level: "skipped" }]);
  });
  it("errors on unknown headers, naming the expected ones", () => {
    const { rows, issues } = parseMemberCsv("full_nm,jenis\nAina,guru");
    expect(rows).toEqual([]);
    expect(issues[0]).toMatchObject({ kind: "header", level: "error" });
    expect(issues[0].message).toContain("nama, kategori, telefon");
  });
  it("warns about an extra unknown column but still imports", () => {
    const { rows, issues } = parseMemberCsv("nama,umur\nAina,30");
    expect(rows).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "unknown-column", level: "warning" });
  });
});
