import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads plain rows and drops blank lines", () => {
    expect(parseCsv("nama,kategori\nCikgu Aina,guru\n\n")).toEqual([
      ["nama", "kategori"],
      ["Cikgu Aina", "guru"],
    ]);
  });
  it("handles quoted commas, doubled quotes and line breaks in quotes", () => {
    expect(parseCsv('"Tan, Mei Ling",guru\n"Kata ""hai""",lain\n"Baris\ndua",x')).toEqual([
      ["Tan, Mei Ling", "guru"],
      ['Kata "hai"', "lain"],
      ["Baris\ndua", "x"],
    ]);
  });
  it("accepts CRLF, a byte-order mark and semicolons", () => {
    expect(parseCsv("﻿a;b\r\nc;d\r\n", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
