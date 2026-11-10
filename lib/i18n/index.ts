// Typed dictionaries, no external library. `ms` is the source of truth: `en` is typed from it, so a
// missing or extra English key fails the type check. The app is client-rendered on demo data, so
// the locale is a per-browser display preference (Preferences.locale), never part of club data.

import { en } from "./en";
import { ms } from "./ms";
import type { MessageKey, Messages } from "./types";

export type { MessageKey, Messages } from "./types";

export type Locale = "ms" | "en";
export const LOCALES: readonly Locale[] = ["ms", "en"];
export const defaultLocale: Locale = "ms";

export function isLocale(value: unknown): value is Locale {
  return value === "ms" || value === "en";
}

export type Vars = Record<string, string | number>;
type Tree = { [key: string]: string | Tree };

export const dictionaries: Record<Locale, Messages> = { ms, en };

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

const warned = new Set<string>();

function warnMissing(locale: Locale, key: string) {
  if (process.env.NODE_ENV === "production") return;
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[i18n] Missing "${locale}" translation for "${key}"; using "${defaultLocale}".`);
}

/** Replaces `{name}` placeholders; a placeholder with no value is left visible rather than dropped. */
export function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * Looks `key` up in `locale`, falls back to Bahasa Melayu (with a development warning) when the
 * key is missing at runtime, and returns the key itself if even that is missing. `dicts` is a
 * seam for tests; the app always uses the real dictionaries.
 */
export function translate(locale: Locale, key: string, vars?: Vars, dicts: Record<Locale, unknown> = dictionaries): string {
  const found = lookup(dicts[locale] as Tree, key);
  if (found !== undefined) return interpolate(found, vars);
  if (locale !== defaultLocale) warnMissing(locale, key);
  const fallback = lookup(dicts[defaultLocale] as Tree, key);
  return fallback === undefined ? key : interpolate(fallback, vars);
}

// The locale for code that runs outside React (label tables, error messages, formatters). The
// prefs provider keeps it in step with the stored preference; components should prefer useT().
let current: Locale = defaultLocale;
export const getLocale = () => current;
export const setCurrentLocale = (locale: Locale) => {
  current = locale;
};

/** Translate with the current locale. */
export const t = (key: MessageKey, vars?: Vars) => translate(current, key, vars);
