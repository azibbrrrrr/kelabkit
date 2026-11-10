import { describe, expect, it } from "vitest";
import { checkCollectionIcon, isSingleEmoji, lucideIconLabels, lucideNameOf, suggestIcon } from "@/lib/collection-icon";
import { emojiCatalog, emojiCategories, searchEmoji } from "@/lib/emoji-catalog";
import { KelabError } from "@/lib/errors";

const rejects = (icon: string) => {
  expect(() => checkCollectionIcon(icon)).toThrow(KelabError);
  try {
    checkCollectionIcon(icon);
  } catch (error) {
    expect((error as KelabError).code).toBe("ICON_INVALID");
  }
};

describe("checkCollectionIcon", () => {
  it("accepts null and reads undefined (older snapshots) as null", () => {
    expect(checkCollectionIcon(null)).toBeNull();
    expect(checkCollectionIcon(undefined)).toBeNull();
  });

  it("accepts exactly one emoji, including multi-code-point ones", () => {
    for (const emoji of [
      "💰",
      "🍽️", // VS16
      "👩‍🏫", // ZWJ profession
      "👨‍👩‍👧‍👦", // ZWJ family
      "🇲🇾", // regional-indicator flag
      "🏴󠁧󠁢󠁳󠁣󠁴󠁿", // subdivision tag flag
      "👍🏽", // skin tone
      "🧑🏾‍🎓", // skin tone + ZWJ
      "❤️",
      "1️⃣", // keycap
    ]) {
      expect(checkCollectionIcon(emoji), emoji).toBe(emoji);
    }
  });

  it("rejects two emoji, text, empty and overlong values", () => {
    rejects("💰🎁");
    rejects("🇲🇾🇲🇾");
    rejects("a");
    rejects("RM");
    rejects("💰 ");
    rejects(" 💰");
    rejects("");
    rejects("©"); // pictographic but text-style without VS16
    rejects("1");
    rejects("👨‍👩‍👧‍👦".repeat(3));
    rejects("x".repeat(40));
  });

  it("accepts allowlisted lucide icons only", () => {
    expect(checkCollectionIcon("lucide:gift")).toBe("lucide:gift");
    expect(checkCollectionIcon("lucide:heart-handshake")).toBe("lucide:heart-handshake");
    rejects("lucide:skull");
    rejects("lucide:");
    rejects("lucide:Gift");
    rejects("lucide:constructor");
    expect(lucideNameOf("lucide:gift")).toBe("gift");
    expect(lucideNameOf("🎁")).toBeNull();
    expect(Object.keys(lucideIconLabels).length).toBeGreaterThanOrEqual(20);
  });
});

describe("emoji catalogue", () => {
  it("holds ~200 unique emoji, every one a valid icon, in the eight categories", () => {
    expect(emojiCatalog.length).toBeGreaterThanOrEqual(190);
    expect(new Set(emojiCatalog.map((entry) => entry.emoji)).size).toBe(emojiCatalog.length);
    for (const entry of emojiCatalog) {
      expect(isSingleEmoji(entry.emoji), `${entry.emoji} ${entry.name}`).toBe(true);
      expect(entry.name.length).toBeGreaterThan(0);
    }
    expect(emojiCategories.map((category) => category.label)).toEqual([
      "Makanan & minuman",
      "Pakaian",
      "Hadiah & sambutan",
      "Wang & urusan",
      "Sekolah & pendidikan",
      "Sukan & aktiviti",
      "Perjalanan",
      "Alam & simbol",
    ]);
    for (const category of emojiCategories) expect(emojiCatalog.some((entry) => entry.category === category.id)).toBe(true);
  });
});

describe("searchEmoji", () => {
  const hits = (query: string) => searchEmoji(query).map((entry) => entry.emoji);

  it("finds by Malay and English keywords, exact matches first", () => {
    expect(hits("makan")[0]).toBe("🍽️");
    expect(hits("jamuan")).toContain("🍽️");
    expect(hits("food")).toContain("🍽️");
    expect(hits("baju")).toContain("👕");
    expect(hits("tshirt")).toEqual(["👕"]);
    expect(hits("hadiah")[0]).toBe("🎁");
    expect(hits("gift")).toContain("🎁");
    expect(hits("persaraan")).toEqual(["🎁"]);
    expect(hits("yuran")).toEqual(["💰"]);
    expect(hits("money")).toContain("💰");
    expect(hits("duit")).toContain("💰");
  });

  it("matches prefixes, folds case and needs every word", () => {
    expect(hits("MAK")).toContain("🍽️");
    expect(hits("teh tarik")).toEqual([]);
    expect(hits("buah mangga")).toEqual(["🥭"]);
    expect(hits("   ")).toEqual([]);
    expect(hits("zzzz")).toEqual([]);
  });
});

describe("suggestIcon", () => {
  it("suggests the seed icons from collection names", () => {
    expect(suggestIcon("Yuran KGK 2026")).toBe("💰");
    expect(suggestIcon("Jamuan Akhir Tahun")).toBe("🍽️");
    expect(suggestIcon("Baju KGK")).toBe("👕");
    expect(suggestIcon("Hadiah Persaraan Puan Rosnah")).toBe("🎁");
    expect(suggestIcon("Sumbangan Kebajikan")).toBe("🤝");
    expect(suggestIcon("Sambutan Hari Guru 2026")).toBe("👩‍🏫");
  });

  it("falls back to catalogue keywords, ignores filler words and returns null when nothing fits", () => {
    expect(suggestIcon("Rombongan ke Melaka")).toBe("🚌");
    expect(suggestIcon("Kelas Badminton")).toBe("🏸");
    expect(suggestIcon("Hari Kantin")).toBeNull();
    expect(suggestIcon("")).toBeNull();
    expect(suggestIcon("Kutipan 2026")).toBeNull();
  });
});
