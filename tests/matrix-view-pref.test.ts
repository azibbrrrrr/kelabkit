import { describe, expect, it } from "vitest";
import { readLayout, VIEW_KEY, writeLayout } from "@/components/matrix/view-pref";

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
