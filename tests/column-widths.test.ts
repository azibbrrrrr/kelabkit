import { describe, expect, it } from "vitest";
import { clampWidth, layoutWidths, readWidths, WIDTHS_STORAGE_KEY, writeWidths } from "@/components/matrix/column-widths";

const store = (value: string | null) => ({ getItem: (key: string) => (key === WIDTHS_STORAGE_KEY ? value : null) });

describe("clampWidth", () => {
  it("keeps widths inside each column kind's limits", () => {
    expect(clampWidth("single", 40)).toBe(120);
    expect(clampWidth("month", 999)).toBe(480);
    expect(clampWidth("member", 150)).toBe(180);
    expect(clampWidth("single", 200.6)).toBe(201);
  });
});

describe("readWidths / writeWidths", () => {
  it("reads saved numbers and drops malformed entries", () => {
    expect(readWidths(store('{"ahli":250,"c1":"wide","p1":-4,"p2":140.4,"p3":null}'))).toEqual({ ahli: 250, p2: 140 });
  });
  it("treats missing, broken or non-object JSON as no preference", () => {
    expect(readWidths(store(null))).toEqual({});
    expect(readWidths(store("{oops"))).toEqual({});
    expect(readWidths(store("[1,2]"))).toEqual({});
    expect(readWidths(undefined)).toEqual({});
  });
  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(readWidths(throwing)).toEqual({});
    expect(() => writeWidths(throwing, { ahli: 200 })).not.toThrow();
  });
  it("round-trips and clears the key when nothing is sized", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    writeWidths(storage, { ahli: 260, c1: 300 });
    expect(readWidths(storage)).toEqual({ ahli: 260, c1: 300 });
    writeWidths(storage, {});
    expect(data.has(WIDTHS_STORAGE_KEY)).toBe(false);
  });
});

describe("layoutWidths", () => {
  it("uses defaults and saved sizes as-is when the grid overflows its card", () => {
    expect(layoutWidths([{ kind: "single" }, { kind: "month", size: 300 }, { kind: "month" }], 344, 600)).toEqual({ columns: [200, 300, 136], balance: 120 });
  });
  it("gives spare width to unsized columns in proportion; sized columns stay exact", () => {
    const { columns: out, balance } = layoutWidths([{ kind: "single" }, { kind: "single", size: 150 }, { kind: "single" }], 344, 1200);
    expect(balance).toBe(120);
    expect(out[1]).toBe(150);
    expect(out[0] + out[1] + out[2] + 344).toBe(1200);
    expect(out[0]).toBe(out[2]);
  });
  it("gives spare width to Baki semasa when every column is sized, so chosen widths stay exact", () => {
    expect(layoutWidths([{ kind: "single", size: 150 }, { kind: "single", size: 160 }], 344, 1000)).toEqual({ columns: [150, 160], balance: 466 });
  });
  it("clamps saved sizes outside the limits", () => {
    expect(layoutWidths([{ kind: "single", size: 20 }, { kind: "month", size: 2000 }], 0, 0)).toEqual({ columns: [120, 480], balance: 120 });
  });
});
