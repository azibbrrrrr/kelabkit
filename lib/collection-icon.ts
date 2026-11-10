// What a collection's `icon` may hold, checked the same way by the demo backend and by the
// picker (and by the Neon backend in Phase 2): null, exactly one emoji grapheme, or
// "lucide:<name>" from the allowlist below. Pure: no React, so it is unit-tested directly.

import { KelabError } from "@/lib/errors";
import { emojiCatalog } from "@/lib/emoji-catalog";

/** Lucide icons a treasurer may pick, with the Bahasa Melayu label used as their accessible name. */
export const lucideIconLabels = {
  wallet: "Dompet",
  "piggy-bank": "Tabung",
  "hand-coins": "Duit",
  receipt: "Resit",
  utensils: "Makanan",
  coffee: "Minuman",
  cake: "Kek",
  shirt: "Baju",
  gift: "Hadiah",
  "party-popper": "Sambutan",
  "heart-handshake": "Kebajikan",
  "graduation-cap": "Graduasi",
  "book-open": "Buku",
  school: "Sekolah",
  trophy: "Trofi",
  medal: "Pingat",
  dumbbell: "Sukan",
  music: "Muzik",
  bus: "Rombongan",
  plane: "Lawatan",
  tent: "Perkhemahan",
  "calendar-days": "Kalendar",
  users: "Ahli",
  star: "Bintang",
} as const;

export type LucideIconName = keyof typeof lucideIconLabels;
export const LUCIDE_PREFIX = "lucide:";
/** Longest emoji value accepted, in UTF-16 code units. A family ZWJ sequence is 11, a subdivision flag 14. */
export const MAX_ICON_LENGTH = 32;

export function isLucideIconName(name: string): name is LucideIconName {
  return Object.prototype.hasOwnProperty.call(lucideIconLabels, name);
}

/** "lucide:gift" → "gift"; anything else → null. */
export function lucideNameOf(icon: string | null | undefined): LucideIconName | null {
  if (!icon?.startsWith(LUCIDE_PREFIX)) return null;
  const name = icon.slice(LUCIDE_PREFIX.length);
  return isLucideIconName(name) ? name : null;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
// Rendered as a colour emoji: emoji presentation by default, or forced by VS16, a skin tone or a ZWJ.
const EMOJI_STYLE = /\p{Emoji_Presentation}|️|\p{Emoji_Modifier}|‍/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
const KEYCAP = /^[0-9#*]️?⃣$/u;

/** True for exactly one emoji: a ZWJ family, a flag, a skin-toned hand or a keycap count as one. */
export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > MAX_ICON_LENGTH || !segmenter) return false;
  const graphemes = [...segmenter.segment(value)];
  if (graphemes.length !== 1) return false;
  if (FLAG.test(value) || KEYCAP.test(value)) return true;
  return PICTOGRAPHIC.test(value) && EMOJI_STYLE.test(value);
}

/** The stored form of an icon, or ICON_INVALID. Undefined (older snapshots) reads as null. */
export function checkCollectionIcon(icon: string | null | undefined): string | null {
  if (icon === null || icon === undefined) return null;
  if (typeof icon !== "string") throw new KelabError("ICON_INVALID");
  if (icon.startsWith(LUCIDE_PREFIX)) {
    if (!lucideNameOf(icon)) throw new KelabError("ICON_INVALID");
    return icon;
  }
  if (!isSingleEmoji(icon)) throw new KelabError("ICON_INVALID");
  return icon;
}

/** Words for the audit summary: the emoji itself, or the lucide icon's label. */
export function describeIcon(icon: string | null): string {
  if (!icon) return "tiada";
  const name = lucideNameOf(icon);
  return name ? `ikon ${lucideIconLabels[name]}` : icon;
}

// Name → suggestion. Checked in this order, so "Jamuan Hari Raya" is food, not Raya, and
// "Sambutan Hari Guru" is the teacher, not the party.
const PRIORITY: [string, string][] = [
  ["yuran", "💰"],
  ["jamuan", "🍽️"],
  ["kenduri", "🍽️"],
  ["makan", "🍽️"],
  ["baju", "👕"],
  ["jersi", "👕"],
  ["persaraan", "🎁"],
  ["hadiah", "🎁"],
  ["kebajikan", "🤝"],
  ["sumbangan", "🤝"],
  ["guru", "👩‍🏫"],
  ["lawatan", "🚌"],
  ["rombongan", "🚌"],
  ["sukan", "⚽"],
  ["raya", "🌙"],
];

// Words common in collection names that say nothing about the subject ("hari" is also in "hari jadi").
const STOPWORDS = new Set(["hari", "tahun", "akhir", "untuk", "dan", "kgk", "kelab", "bulan", "bulanan", "sesi", "program", "majlis"]);

/** A default icon for a new collection from the words in its name, or null when nothing fits. */
export function suggestIcon(name: string): string | null {
  const words = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
  if (!words.length) return null;
  for (const [key, emoji] of PRIORITY) if (words.some((word) => word.startsWith(key))) return emoji;
  for (const word of words.filter((word) => !STOPWORDS.has(word))) {
    const hit = emojiCatalog.find((entry) => entry.keywords.includes(word));
    if (hit) return hit.emoji;
  }
  return null;
}
