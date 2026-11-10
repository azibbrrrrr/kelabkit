import { describe, expect, it } from "vitest";
import { DENSITY_KEY, readDensity, readLayout, readSummary, SUMMARY_KEY, VIEW_KEY, writeDensity, writeLayout, writeSummary } from "@/components/matrix/view-pref";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as unknown as Storage;
};
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("matrix view preference", () => {
  it("round-trips a valid choice under the versioned key", () => {
    const storage = memory();
    writeLayout(storage, "cards");
    expect(storage.getItem(VIEW_KEY)).toBe("cards");
    expect(readLayout(storage)).toBe("cards");
  });
  it("ignores unknown values, missing storage and throwing storage", () => {
    const storage = memory();
    storage.setItem(VIEW_KEY, "table");
    expect(readLayout(storage)).toBeNull();
    expect(readLayout(undefined)).toBeNull();
    expect(readLayout(blocked)).toBeNull();
    expect(() => writeLayout(blocked, "grid")).not.toThrow();
  });
});

describe("matrix density and summary preferences", () => {
  it("round-trip under their own versioned keys and ignore unknown values or blocked storage", () => {
    const storage = memory();
    writeDensity(storage, "compact");
    writeSummary(storage, "overdue");
    expect(storage.getItem(DENSITY_KEY)).toBe("compact");
    expect(readDensity(storage)).toBe("compact");
    expect(readSummary(storage)).toBe("overdue");
    storage.setItem(DENSITY_KEY, "tight");
    storage.setItem(SUMMARY_KEY, "median");
    expect(readDensity(storage)).toBeNull();
    expect(readSummary(storage)).toBeNull();
    expect(readDensity(blocked)).toBeNull();
    expect(() => writeSummary(blocked, "percent")).not.toThrow();
  });
});
