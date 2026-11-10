import { defaultLocale, t, type Locale } from "@/lib/i18n";

// Accent themes. Each only changes the brand palette (primary, tints, borders, sidebar);
// status colours stay fixed so a payment status reads the same in every theme. The CSS
// for each lives in app/globals.css under [data-accent="<id>"]. `swatch` is the reference
// accent (--primary); `fill` mirrors --primary-fill, the AA colour behind white text/icons.

export type ThemeId = "rose" | "lavender" | "teal" | "peach" | "sage";

export const themes: { id: ThemeId; swatch: string; fill: string; tint: string }[] = [
  { id: "rose", swatch: "#E75480", fill: "#D13F6E", tint: "#FCE4EC" },
  { id: "lavender", swatch: "#8E6BD8", fill: "#8662CF", tint: "#EDE7FB" },
  { id: "teal", swatch: "#1E9E91", fill: "#008579", tint: "#D7F2EE" },
  { id: "peach", swatch: "#EE8455", fill: "#BE5928", tint: "#FDE5D8" },
  { id: "sage", swatch: "#6E9E78", fill: "#52815D", tint: "#E2EEE2" },
];

/** Theme name and mood in the current locale. */
export const themeLabel = (id: ThemeId) => t(`themes.${id}.label`);
export const themeMood = (id: ThemeId) => t(`themes.${id}.mood`);

export type Preferences = { theme: ThemeId; floral: boolean; locale: Locale };

export const defaultPreferences: Preferences = { theme: "rose", floral: true, locale: defaultLocale };

export const PREFS_KEY = "kelabkit-prefs-v1";

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
