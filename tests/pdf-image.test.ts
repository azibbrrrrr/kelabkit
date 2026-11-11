import { describe, expect, it } from "vitest";
import { jpegToPdf, pdfPageSize } from "@/lib/pdf-image";

// Not a decodable photo: the writer wraps the bytes untouched, so any bytes with a JPEG marker will do.
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);
const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("jpegToPdf", () => {
  const out = jpegToPdf(jpeg, 2080, 1200);
  const s = text(out);

  it("has a PDF header and an EOF marker", () => {
    expect(s.startsWith("%PDF-1.4\n")).toBe(true);
    expect(s.endsWith("%%EOF\n")).toBe(true);
  });
  it("points every xref entry at its object, and startxref at the table", () => {
    const start = Number(/startxref\n(\d+)\n/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe("xref");
    const entries = [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
  it("declares size 6 and the catalog as root in the trailer", () => {
    expect(s).toContain("trailer\n<< /Size 6 /Root 1 0 R >>");
  });
  it("declares the image size, DCT filter and exact stream length, and embeds the bytes", () => {
    expect(s).toContain("/Width 2080 /Height 1200");
    expect(s).toContain("/Filter /DCTDecode");
    expect(s).toContain(`/Length ${jpeg.length} >>\nstream\n`);
    expect(s).toContain(`stream\n${text(jpeg)}\nendstream`);
  });
  it("sizes the page from the aspect ratio: landscape for wide, portrait for tall", () => {
    expect(pdfPageSize(2080, 1200)).toEqual({ w: 842, h: 485.77 });
    expect(pdfPageSize(1240, 1800)).toEqual({ w: 580.04, h: 842 });
    expect(s).toContain("/MediaBox [0 0 842 485.77]");
  });
  it("rejects a bad size", () => {
    expect(() => jpegToPdf(jpeg, 0, 10)).toThrow();
  });
});
