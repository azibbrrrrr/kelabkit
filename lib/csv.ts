/**
 * A small CSV parser: quoted fields, doubled quotes inside quotes, commas and line breaks
 * inside quotes, CRLF or LF line endings. Drops fully blank rows.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * Serialises rows to CSV for a spreadsheet: every text cell quoted, quotes doubled, CRLF line
 * ends, a BOM so Excel reads UTF-8. A text cell starting with = + - @ (or tab/CR) gets a leading
 * apostrophe so a name or note cannot run as a formula when the file is opened. Numbers are
 * written as given and are never prefixed.
 */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    if (typeof value === "number") return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
