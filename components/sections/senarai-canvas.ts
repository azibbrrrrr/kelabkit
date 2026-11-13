// Draws the payment list sheet on a Canvas 2D at a fixed logical width, to be shared as an image
// or wrapped in a PDF. Canvas rather than a DOM-snapshot library: those are unreliable on iOS
// Safari and most users are on iPhones. The layout mirrors the on-screen sheet; every word comes
// from the Sheet, so it is already translated. Colours are read from the theme's CSS variables.

import type { Sheet } from "@/lib/payment-list";
import type { XlsxColors } from "@/lib/payment-list-xlsx";

/** Logical width with one money column; each further money column adds TOTAL_W. */
export const SHEET_WIDTH = { year: 1040, month: 620 } as const;
const PAD = 22;
const NAME_W = 270;
const TOTAL_W = 80;
const ROW_H = 30;
const GROUP_H = 25;
const TITLE_H = 40;
/** iOS Safari refuses canvases above 16,777,216 pixels. */
const MAX_PIXELS = 16_000_000;

export type SheetTheme = XlsxColors & { card: string; foreground: string; border: string; font: string };

/** A CSS colour expression (`var(--x)`, `color-mix(...)`) as `#rrggbb`, via the browser's own resolution. */
function resolveHex(expression: string): string {
  const probe = document.createElement("span");
  probe.style.color = expression;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function readSheetTheme(): SheetTheme {
  const v = (name: string) => resolveHex(`var(--${name})`);
  return {
    card: "#ffffff",
    foreground: v("foreground"),
    border: v("border"),
    font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    headerFill: v("primary-fill"),
    headerText: v("primary-foreground"),
    futureFill: v("primary-light"),
    futureText: v("primary-strong"),
    groupFill: v("muted"),
    groupText: v("muted-foreground"),
    paid: { fill: v("st-paid-bg"), text: v("st-paid") },
    partial: { fill: v("st-partial-bg"), text: v("st-partial") },
    exempt: { fill: v("st-exempt-bg"), text: v("st-exempt") },
    muted: v("muted-foreground"),
  };
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

export function sheetHeight(sheet: Sheet) {
  const rows = sheet.groups.reduce((total, group) => total + (group.label ? GROUP_H : 0) + group.rows.length * ROW_H, 0);
  return PAD + TITLE_H + ROW_H + rows + 14 + 18 + PAD;
}

/** Draws at `width`×`sheetHeight` logical pixels, scaled by min(2, what the device can hold). */
export function drawSheet(sheet: Sheet, theme: SheetTheme): HTMLCanvasElement {
  const amounts = sheet.amountColumns.length;
  const width = (sheet.month ? SHEET_WIDTH.month : SHEET_WIDTH.year) + Math.max(0, amounts - 1) * TOTAL_W;
  const height = sheetHeight(sheet);
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const font = (size: number, weight = 400) => `${weight} ${size}px ${theme.font}`;
  ctx.fillStyle = theme.card;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";

  // Title and as-of line.
  ctx.font = font(13);
  const asOfW = ctx.measureText(sheet.asOf).width;
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "right";
  ctx.fillText(sheet.asOf, width - PAD, PAD + 14);
  ctx.font = font(20, 700);
  ctx.fillStyle = theme.foreground;
  ctx.textAlign = "left";
  ctx.fillText(fit(ctx, sheet.title, width - PAD * 2 - asOfW - 16), PAD, PAD + 14);

  const cols = sheet.columns.length;
  const totalW = amounts * TOTAL_W;
  const cellW = cols ? (width - PAD * 2 - NAME_W - totalW) / cols : 0;
  const x0 = PAD;
  const colX = (i: number) => x0 + NAME_W + i * cellW;
  const amountX = (j: number) => colX(cols) + j * TOTAL_W;
  let y = PAD + TITLE_H;

  const box = (x: number, top: number, w: number, h: number, fill: string | null) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, top, w, h);
    }
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
  };
  const centred = (text: string, x: number, top: number, w: number, h: number, color: string, weight = 400, size = 12.5) => {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, text, w - 6), x + w / 2, top + h / 2 + 0.5);
  };
  const left = (text: string, x: number, top: number, w: number, h: number, color: string, weight = 500, size = 12.5) => {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, text, w - 20), x + 10, top + h / 2 + 0.5);
  };

  // Header.
  box(x0, y, NAME_W, ROW_H, theme.headerFill);
  left(sheet.nameHeader, x0, y, NAME_W, ROW_H, theme.headerText, 600);
  sheet.columns.forEach((column, i) => {
    box(colX(i), y, cellW, ROW_H, column.future ? theme.futureFill : theme.headerFill);
    centred(column.label, colX(i), y, cellW, ROW_H, column.future ? theme.futureText : theme.headerText, 600);
  });
  sheet.amountColumns.forEach((column, j) => {
    box(amountX(j), y, TOTAL_W, ROW_H, theme.headerFill);
    centred(column.header, amountX(j), y, TOTAL_W, ROW_H, theme.headerText, 600);
  });
  y += ROW_H;

  for (const group of sheet.groups) {
    if (group.label) {
      box(x0, y, width - PAD * 2, GROUP_H, theme.groupFill);
      left(group.label, x0, y, width - PAD * 2, GROUP_H, theme.groupText, 600, 11.5);
      y += GROUP_H;
    }
    for (const row of group.rows) {
      box(x0, y, NAME_W, ROW_H, null);
      left(row.name, x0, y, NAME_W, ROW_H, theme.foreground);
      row.cells.forEach((cell, i) => {
        const tone = cell.kind === "blank" ? null : theme[cell.kind];
        box(colX(i), y, cellW, ROW_H, tone?.fill ?? null);
        if (tone) centred(cell.text, colX(i), y, cellW, ROW_H, tone.text, cell.kind === "partial" ? 600 : 500);
      });
      row.amounts.forEach((amount, j) => {
        box(amountX(j), y, TOTAL_W, ROW_H, null);
        centred(amount.text ?? "—", amountX(j), y, TOTAL_W, ROW_H, amount.text ? theme.foreground : theme.muted, 600);
      });
      y += ROW_H;
    }
  }

  // Legend.
  y += 14;
  let lx = PAD;
  for (const item of sheet.legend) {
    const tone = item.kind === "blank" ? null : theme[item.kind];
    ctx.fillStyle = tone?.fill ?? theme.card;
    ctx.fillRect(lx, y + 2, 14, 14);
    ctx.strokeStyle = theme.border;
    ctx.strokeRect(lx + 0.5, y + 2.5, 13, 13);
    ctx.font = font(12);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "left";
    ctx.fillText(item.label, lx + 20, y + 9.5);
    lx += 20 + ctx.measureText(item.label).width + 16;
  }
  return canvas;
}

export const canvasBlob = (canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), type, quality));
