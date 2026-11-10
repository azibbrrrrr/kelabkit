// Accent themes. Each only changes the brand palette (primary, tints, borders, sidebar);
// status colours stay fixed so a payment status reads the same in every theme. The CSS
// for each lives in app/globals.css under [data-accent="<id>"].

export type ThemeId = "rose" | "lavender" | "teal" | "peach" | "sage";

export const themes: { id: ThemeId; label: string; mood: string; swatch: string; tint: string }[] = [
  { id: "rose", label: "Rose", mood: "Lembut & profesional", swatch: "#E75480", tint: "#FCE4EC" },
  { id: "lavender", label: "Lavender", mood: "Moden & tenang", swatch: "#8E6BD8", tint: "#EDE7FB" },
  { id: "teal", label: "Teal", mood: "Segar & seimbang", swatch: "#1E9E91", tint: "#D7F2EE" },
  { id: "peach", label: "Peach", mood: "Mesra & ceria", swatch: "#EE8455", tint: "#FDE5D8" },
  { id: "sage", label: "Sage", mood: "Damai & semula jadi", swatch: "#6E9E78", tint: "#E2EEE2" },
];

export type Preferences = { theme: ThemeId; floral: boolean };

export const defaultPreferences: Preferences = { theme: "rose", floral: true };

export const PREFS_KEY = "kelabkit-prefs-v1";

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
