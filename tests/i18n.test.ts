import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries, interpolate, setCurrentLocale, t, translate, type Locale } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ms } from "@/lib/i18n/ms";
import { formatDay, formatMonth, formatMonthLong, monthNamesShort } from "@/lib/format";
import { cellStatusLabels, overdueLabel } from "@/lib/labels";
import { errorMessages, messageFor } from "@/lib/errors";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, `${path}.`));
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setCurrentLocale("ms"));

describe("dictionary parity", () => {
  const flatMs = flatten(ms as unknown as Tree);
  const flatEn = flatten(en as unknown as Tree);

  it("has exactly the same keys in ms and en", () => {
    expect(Object.keys(flatEn).sort()).toEqual(Object.keys(flatMs).sort());
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...Object.entries(flatMs), ...Object.entries(flatEn)]) expect(value.trim(), key).not.toBe("");
  });

  it("uses the same {placeholders} in both languages", () => {
    for (const key of Object.keys(flatMs)) expect(placeholders(flatEn[key]), key).toEqual(placeholders(flatMs[key]));
  });
});

describe("interpolation", () => {
  it("fills {name} placeholders, numbers included", () => {
    expect(interpolate("Hi {name}, {count} left", { name: "Aisyah", count: 3 })).toBe("Hi Aisyah, 3 left");
  });

  it("leaves an unfilled placeholder visible and tolerates no vars", () => {
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
    expect(interpolate("Hi {name}")).toBe("Hi {name}");
  });

  it("translates a real key in each locale", () => {
    expect(translate("ms", "shell.session", { session: "2026" })).toBe("Sesi 2026");
    expect(translate("en", "shell.session", { session: "2026" })).toBe("Session 2026");
  });
});

describe("fallback", () => {
  const partial: Record<Locale, unknown> = { ms: { a: { b: "Salam {who}" }, only: "Hanya ms" }, en: { a: { b: "Hello {who}" } } };

  it("uses the requested locale when the key exists", () => {
    expect(translate("en", "a.b", { who: "x" }, partial)).toBe("Hello x");
  });

  it("falls back to ms for a key missing in en, and warns once in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("en", "only", undefined, partial)).toBe("Hanya ms");
    translate("en", "only", undefined, partial);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"only"');
    warn.mockRestore();
  });

  it("returns the key when it is missing everywhere", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("en", "nope.nothing", undefined, partial)).toBe("nope.nothing");
    warn.mockRestore();
  });
});

describe("locale-aware tables and formatting", () => {
  it("follows the current locale for status labels, errors and the fallback message", () => {
    expect(cellStatusLabels.paid[0]).toBe("Dibayar");
    expect(errorMessages.AMOUNT_REQUIRED).toBe("Masukkan amaun.");
    setCurrentLocale("en");
    expect(cellStatusLabels.paid[0]).toBe("Paid");
    expect(overdueLabel[0]).toBe("Overdue");
    expect(errorMessages.AMOUNT_REQUIRED).toBe("Enter an amount.");
    expect(messageFor(new Error("boom"))).toBe(dictionaries.en.errorFallback);
    expect(t("nav.dashboard")).toBe("Dashboard");
  });

  it("names months in Bahasa Melayu and English, with RM unchanged", () => {
    expect(monthNamesShort().join(" ")).toBe("Jan Feb Mac Apr Mei Jun Jul Ogo Sep Okt Nov Dis");
    expect(formatDay("2026-03-15")).toBe("15 Mac 2026");
    expect(formatMonthLong("2026-08")).toBe("Ogos 2026");
    setCurrentLocale("en");
    expect(monthNamesShort().join(" ")).toBe("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec");
    expect(formatDay("2026-03-15")).toBe("15 Mar 2026");
    expect(formatMonth("2026-05", false)).toBe("May");
    expect(formatMonthLong("2026-08")).toBe("August 2026");
  });
});

describe("English is actually translated", () => {
  const flatMs = flatten(ms as unknown as Tree);
  const flatEn = flatten(en as unknown as Tree);
  // Values that are legitimately identical in both languages (proper nouns, units, symbols).
  const sameKeys = Object.keys(flatMs).filter((k) => flatMs[k] === flatEn[k] && /[A-Za-z]{4,}/.test(flatMs[k].replace(/\{\w+\}/g, "")));

  it("leaves few long words untranslated in en (copy-paste guard)", () => {
    expect(sameKeys.length, sameKeys.join("\n")).toBeLessThan(40);
  });
});
