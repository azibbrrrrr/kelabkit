"use client";

import { useOptionalPrefs } from "@/components/prefs-provider";
import { useCallback } from "react";
import { defaultLocale, translate, type Locale, type MessageKey, type Vars } from "./index";

export type TFunction = (key: MessageKey, vars?: Vars) => string;

/** The locale from the stored preferences (Bahasa Melayu outside the provider, e.g. in tests). */
export function useLocale(): Locale {
  return useOptionalPrefs()?.locale ?? defaultLocale;
}

/** `t` bound to the current locale; components re-render when the locale changes. */
export function useT(): TFunction {
  const locale = useLocale();
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}
