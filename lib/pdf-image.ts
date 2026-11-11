// A one-page PDF around one JPEG, written by hand so the list can be downloaded as a real .pdf
// on a phone (window.print is awkward on iPhone) without a PDF library. The JPEG bytes go in
// untouched as a /DCTDecode image; the page takes the image's aspect ratio.

/** Long edge of the page in points (A4's 842). */
const LONG_EDGE = 842;

export function pdfPageSize(width: number, height: number): { w: number; h: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  return width >= height ? { w: LONG_EDGE, h: round((LONG_EDGE * height) / width) } : { w: round((LONG_EDGE * width) / height), h: LONG_EDGE };
}

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);

/** `jpeg` is a baseline RGB JPEG; `width` and `height` are its pixel size. */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("jpegToPdf: bad image size");
  const page = pdfPageSize(width, height);
  const content = `q ${page.w} 0 0 ${page.h} 0 0 cm /Im0 Do Q`;
  const objects: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w} ${page.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)],
    [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      ascii("\nendstream"),
    ],
    [ascii(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)],
  ];

  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets: number[] = [];
  let at = chunks[0].length;
  objects.forEach((parts, i) => {
    offsets.push(at);
    const piece = [ascii(`${i + 1} 0 obj\n`), ...parts, ascii("\nendobj\n")];
    for (const part of piece) {
      chunks.push(part);
      at += part.length;
    }
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(ascii(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));

  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
