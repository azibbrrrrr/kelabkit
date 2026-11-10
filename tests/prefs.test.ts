import { describe, expect, it } from "vitest";
import { accountBootScript, createPrefsSaver, isEmptyPrefs, MAX_WIDTH_ENTRIES, mergePrefs, parsePrefs, prefsBytes, samePrefs, type StoredPrefs } from "@/lib/prefs";

describe("parsePrefs", () => {
  it("keeps known keys with valid values", () => {
    const input = { theme: "teal", floral: false, locale: "en", matrixLayout: "grid", matrixWidths: { ahli: 240, abc: 130.4 } };
    expect(parsePrefs(input)).toEqual({ theme: "teal", floral: false, locale: "en", matrixLayout: "grid", matrixWidths: { ahli: 240, abc: 130 } });
  });
  it("drops unknown keys and invalid values instead of throwing", () => {
    expect(parsePrefs({ theme: "neon", floral: "yes", locale: "fr", matrixLayout: "table", extra: 1, __proto__: { theme: "rose" } })).toEqual({});
    expect(parsePrefs(null)).toEqual({});
    expect(parsePrefs("theme")).toEqual({});
    expect(parsePrefs([{ theme: "rose" }])).toEqual({});
  });
  it("filters bad widths and caps their number", () => {
    const widths = parsePrefs({ matrixWidths: { ok: 200, neg: -1, zero: 0, nan: Number.NaN, inf: Infinity, str: "9", huge: 99999, [`k${"x".repeat(50)}`]: 150, "": 150 } }).matrixWidths;
    expect(widths).toEqual({ ok: 200 });
    const many = Object.fromEntries(Array.from({ length: MAX_WIDTH_ENTRIES + 50 }, (_, i) => [`c${i}`, 150]));
    expect(Object.keys(parsePrefs({ matrixWidths: many }).matrixWidths ?? {})).toHaveLength(MAX_WIDTH_ENTRIES);
  });
  it("an explicit empty widths object is kept (it resets them)", () => {
    expect(parsePrefs({ matrixWidths: {} })).toEqual({ matrixWidths: {} });
  });
  it("measures serialised size in bytes", () => {
    expect(prefsBytes({ a: "é" })).toBe(new TextEncoder().encode('{"a":"é"}').length);
  });
});

describe("merge and compare", () => {
  it("a patch wins key by key and keeps the rest", () => {
    expect(mergePrefs({ theme: "rose", floral: true }, { theme: "sage" })).toEqual({ theme: "sage", floral: true });
  });
  it("samePrefs compares widths by entry", () => {
    expect(samePrefs({ matrixWidths: { a: 1, b: 2 } }, { matrixWidths: { b: 2, a: 1 } })).toBe(true);
    expect(samePrefs({ matrixWidths: { a: 1 } }, { matrixWidths: { a: 2 } })).toBe(false);
    expect(samePrefs({ matrixWidths: {} }, {})).toBe(true);
    expect(samePrefs({ theme: "rose" }, { theme: "teal" })).toBe(false);
    expect(isEmptyPrefs({})).toBe(true);
  });
});

/** A manual clock, so the debounce is tested without real waiting. */
function clock() {
  let next = 1;
  const timers = new Map<number, () => void>();
  return {
    setTimer: (fn: () => void) => {
      timers.set(next, fn);
      return next++;
    },
    clearTimer: (handle: unknown) => void timers.delete(handle as number),
    fire: () => {
      const [id, fn] = [...timers][0] ?? [];
      if (id === undefined || !fn) return false;
      timers.delete(id);
      fn();
      return true;
    },
    count: () => timers.size,
  };
}

describe("createPrefsSaver", () => {
  it("collapses a burst of changes into one send with the last value per key", async () => {
    const sent: StoredPrefs[] = [];
    const c = clock();
    const saver = createPrefsSaver({ send: async (p) => (sent.push(p), true), setTimer: c.setTimer, clearTimer: c.clearTimer });
    for (let w = 200; w <= 260; w += 10) saver.queue({ matrixWidths: { ahli: w } });
    saver.queue({ theme: "teal" });
    expect(c.count()).toBe(1); // each change restarts the one timer
    expect(sent).toEqual([]);
    c.fire();
    await saver.flush();
    expect(sent).toEqual([{ matrixWidths: { ahli: 260 }, theme: "teal" }]);
    expect(saver.pending()).toEqual({});
  });

  it("flush sends at once and does nothing when nothing is pending", async () => {
    const sent: StoredPrefs[] = [];
    const c = clock();
    const saver = createPrefsSaver({ send: async (p) => (sent.push(p), true), setTimer: c.setTimer, clearTimer: c.clearTimer });
    await saver.flush();
    expect(sent).toEqual([]);
    saver.queue({ floral: false });
    await saver.flush();
    expect(sent).toEqual([{ floral: false }]);
    expect(c.count()).toBe(0);
  });

  it("sends one at a time and in order (last write wins on the server)", async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const c = clock();
    const saver = createPrefsSaver({
      send: async (p) => {
        log.push(`start ${p.theme}`);
        if (p.theme === "rose") await new Promise<void>((resolve) => (release = resolve));
        log.push(`end ${p.theme}`);
        return true;
      },
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    saver.queue({ theme: "rose" });
    const first = saver.flush();
    await new Promise((resolve) => setTimeout(resolve, 0)); // the first send is now in flight
    saver.queue({ theme: "sage" });
    const second = saver.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["start rose"]); // the second waits for the first
    release();
    await Promise.all([first, second]);
    expect(log).toEqual(["start rose", "end rose", "start sage", "end sage"]);
  });

  it("a failed send keeps its patch, and a newer value for the same key still wins", async () => {
    const sent: StoredPrefs[] = [];
    let fail = true;
    const c = clock();
    const saver = createPrefsSaver({
      send: async (p) => {
        sent.push(p);
        if (fail) throw new Error("offline");
        return true;
      },
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    saver.queue({ theme: "rose", floral: false });
    await saver.flush();
    expect(saver.pending()).toEqual({ theme: "rose", floral: false });
    fail = false;
    saver.queue({ theme: "teal" });
    await saver.flush();
    expect(sent.at(-1)).toEqual({ theme: "teal", floral: false });
    expect(saver.pending()).toEqual({});
  });
});

describe("accountBootScript", () => {
  it("emits nothing when the account has no saved preferences", () => {
    expect(accountBootScript(null)).toBeNull();
  });
  it("sets only the saved keys and marks the account as the source", () => {
    const script = accountBootScript({ theme: "lavender", floral: false, locale: "en" }) ?? "";
    expect(script).toContain('r.dataset.accent="lavender"');
    expect(script).toContain('r.dataset.floral="off"');
    expect(script).toContain('r.lang="en"');
    expect(script).toContain('r.dataset.prefsSource="account"');
    expect(accountBootScript({ theme: "sage" })).not.toContain("floral");
  });
  it("cannot be broken out of, whatever reaches it", () => {
    const script = accountBootScript({ theme: "</script><b>" as never }) ?? "";
    expect(script).not.toContain("</script>");
  });
});
