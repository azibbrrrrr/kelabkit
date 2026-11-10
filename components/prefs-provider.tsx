"use client";

import { defaultPreferences, isThemeId, PREFS_KEY, type Preferences } from "@/lib/themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Display preferences live apart from club data, so changing a theme can never touch a
// payment record. Phase 2 moves them to user_preferences; this keeps them per browser.

type PrefsState = Preferences & { setPrefs: (changes: Partial<Preferences>) => void };

const PrefsContext = createContext<PrefsState | null>(null);

function readPrefs(): Preferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : defaultPreferences.theme,
      floral: typeof parsed.floral === "boolean" ? parsed.floral : defaultPreferences.floral,
    };
  } catch {
    return defaultPreferences;
  }
}

function apply(prefs: Preferences) {
  const root = document.documentElement;
  root.dataset.accent = prefs.theme;
  root.dataset.floral = prefs.floral ? "on" : "off";
}

/** Runs before paint (inlined in the root layout) so the saved theme never flashes. */
export const prefsBootScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}");var r=document.documentElement;if(p.theme)r.dataset.accent=p.theme;if(p.floral===false)r.dataset.floral="off";}catch(e){}})();`;

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Preferences>(defaultPreferences);

  useEffect(() => {
    const stored = readPrefs();
    setState(stored);
    apply(stored);
  }, []);

  const setPrefs = useCallback((changes: Partial<Preferences>) => {
    setState((current) => {
      const next = { ...current, ...changes };
      apply(next);
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Blocked storage: the choice lasts for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, setPrefs }), [prefs, setPrefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const context = useContext(PrefsContext);
  if (!context) throw new Error("usePrefs must be used inside PrefsProvider.");
  return context;
}
