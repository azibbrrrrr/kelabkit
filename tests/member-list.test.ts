import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import { buildMemberExport, parseMemberSort, senToDecimal, sortMembers, type MemberRow } from "@/lib/member-list";
import { parseMemberCsv } from "@/lib/member-import";
import type { Member } from "@/lib/types";

const row = (name: string, dueNow: number, updatedAt = "2026-01-01T00:00:00Z", extra: Partial<Member> = {}): MemberRow => ({
  member: { id: name, name, category: "guru", phone: null, notes: null, active: true, joinedOn: "2026-01-01", createdAt: "2026-01-01T00:00:00Z", updatedAt, ...extra },
  collections: 2,
  dueNow,
  overdue: 0,
});
const names = (rows: MemberRow[]) => rows.map((r) => r.member.name);

describe("sortMembers", () => {
  const rows = [row("Cahaya", 0, "2026-03-01T00:00:00Z"), row("Aminah", 3500, "2026-01-01T00:00:00Z"), row("Zainab", 6500, "2026-02-01T00:00:00Z"), row("Bakar", 3500, "2026-04-01T00:00:00Z")];

  it("orders by balance due, largest first, ties by name", () => {
    expect(names(sortMembers(rows, "baki"))).toEqual(["Zainab", "Aminah", "Bakar", "Cahaya"]);
  });
  it("orders by name", () => {
    expect(names(sortMembers(rows, "nama"))).toEqual(["Aminah", "Bakar", "Cahaya", "Zainab"]);
  });
  it("orders by most recently updated", () => {
    expect(names(sortMembers(rows, "kemas-kini"))).toEqual(["Bakar", "Cahaya", "Zainab", "Aminah"]);
  });
  it("does not mutate its input", () => {
    const before = names(rows);
    sortMembers(rows, "baki");
    expect(names(rows)).toEqual(before);
  });
});

describe("parseMemberSort", () => {
  it("defaults to balance and ignores unknown values", () => {
    expect(parseMemberSort(null)).toBe("baki");
    expect(parseMemberSort("nonsense")).toBe("baki");
    expect(parseMemberSort("nama")).toBe("nama");
    expect(parseMemberSort("kemas-kini")).toBe("kemas-kini");
  });
});

describe("senToDecimal", () => {
  it("formats integer sen without floats", () => {
    expect(senToDecimal(0)).toBe("0.00");
    expect(senToDecimal(5)).toBe("0.05");
    expect(senToDecimal(3550)).toBe("35.50");
    expect(senToDecimal(123456)).toBe("1234.56");
  });
});

describe("toCsv", () => {
  it("quotes text, doubles quotes, keeps commas and line breaks inside a cell, leaves numbers bare", () => {
    const csv = toCsv([["a,b", 'say "hi"', "line\nbreak", 3]]);
    expect(parseCsv(csv)).toEqual([["a,b", 'say "hi"', "line\nbreak", "3"]]);
    expect(csv).toContain(",3\r\n");
  });
  it("neutralises formula starts in text cells", () => {
    const [cells] = parseCsv(toCsv([["=SUM(A1)", "+60123", "-x", "@cmd", "ok"]]));
    expect(cells).toEqual(["'=SUM(A1)", "'+60123", "'-x", "'@cmd", "ok"]);
  });
});

describe("buildMemberExport", () => {
  it("writes exactly the rows given, in order, with balance in RM", () => {
    const rows = [row("Zainab", 6500, undefined, { phone: "012-345 6789" }), row("Aminah", 0, undefined, { category: null, active: false })];
    expect(parseCsv(buildMemberExport(rows))).toEqual([
      ["nama", "kategori", "telefon", "status", "kutipan", "baki_semasa_rm"],
      ["Zainab", "guru", "012-345 6789", "aktif", "2", "65.00"],
      ["Aminah", "", "", "tidak aktif", "2", "0.00"],
    ]);
  });
  it("is just the header for an empty list", () => {
    expect(parseCsv(buildMemberExport([]))).toEqual([["nama", "kategori", "telefon", "status", "kutipan", "baki_semasa_rm"]]);
  });
  it("can be read back by the member import", () => {
    const { rows, issues } = parseMemberCsv(buildMemberExport([row("Zainab", 6500, undefined, { phone: "012-345 6789" })]));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(rows.map((r) => [r.name, r.category, r.phone])).toEqual([["Zainab", "guru", "012-345 6789"]]);
  });
});
