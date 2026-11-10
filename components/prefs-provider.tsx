"use client";

import { savePrefs } from "@/app/actions/prefs";
import { readDensity, readLayout, readSummary, writeDensity, writeLayout, writeSummary } from "@/components/matrix/view-pref";
import { browserStorage, readWidths, writeWidths } from "@/components/matrix/column-widths";
import { isLocale, LOCALE_COOKIE, setCurrentLocale, type Locale } from "@/lib/i18n";
import { createPrefsSaver, isEmptyPrefs, PREFS_SOURCE_ATTR, mergePrefs, samePrefs, type MatrixDensity, type MatrixLayout, type MatrixSummary, type PrefsSaver, type StoredPrefs, type Widths } from "@/lib/prefs";
import { defaultPreferences, isThemeId, PREFS_KEY, type Preferences } from "@/lib/themes";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Display preferences live apart from club data, so changing a theme can never touch a payment
// record. Where they are kept depends on the mode, decided once per render tree:
//   - demo / signed out: this browser's localStorage (unchanged from before accounts existed);
//   - signed in: Postgres, per user (lib/prefs.ts, kk_save_prefs), so they follow the treasurer
//     across devices. The server loads them with the shell (no extra request) and seeds `account`;
//     a change is applied and mirrored at once, then saved after a short quiet period.

type Resolved = Preferences & {
  /** null = no saved choice: Jadual on desktop, Kad on phones. */
  matrixLayout: MatrixLayout | null;
  matrixDensity: MatrixDensity;
  matrixSummary: MatrixSummary;
  matrixWidths: Widths;
};
type PrefsState = Resolved & { setPrefs: (changes: StoredPrefs) => void };
export type AccountSeed = { initial: StoredPrefs | null };

const PrefsContext = createContext<PrefsState | null>(null);

const defaults: Resolved = { ...defaultPreferences, matrixLayout: null, matrixDensity: "comfortable", matrixSummary: "received", matrixWidths: {} };

function resolve(stored: StoredPrefs): Resolved {
  return {
    theme: stored.theme ?? defaults.theme,
    floral: stored.floral ?? defaults.floral,
    locale: stored.locale ?? defaults.locale,
    matrixLayout: stored.matrixLayout ?? null,
    matrixDensity: stored.matrixDensity ?? defaults.matrixDensity,
    matrixSummary: stored.matrixSummary ?? defaults.matrixSummary,
    matrixWidths: stored.matrixWidths ?? {},
  };
}

/** What this browser has saved, only the keys it actually has (so it can seed an account). */
function readLocal(): StoredPrefs {
  const stored: StoredPrefs = {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}");
    if (isThemeId(parsed.theme)) stored.theme = parsed.theme;
    if (typeof parsed.floral === "boolean") stored.floral = parsed.floral;
    if (isLocale(parsed.locale)) stored.locale = parsed.locale;
  } catch {
    // Unreadable or blocked storage: nothing to carry over.
  }
  const layout = readLayout(browserStorage());
  if (layout) stored.matrixLayout = layout;
  const density = readDensity(browserStorage());
  if (density) stored.matrixDensity = density;
  const summary = readSummary(browserStorage());
  if (summary) stored.matrixSummary = summary;
  const widths = readWidths(browserStorage());
  if (Object.keys(widths).length > 0) stored.matrixWidths = widths;
  return stored;
}

const DISPLAY_KEYS = ["theme", "floral", "locale"] as const;
const touchesDisplay = (changes: StoredPrefs) => DISPLAY_KEYS.some((key) => key in changes);

/** Theme, floral and language go to localStorage in both modes: the boot script reads them before paint. */
function mirrorDisplay(prefs: Resolved) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: prefs.theme, floral: prefs.floral, locale: prefs.locale }));
  } catch {
    // Blocked storage: the choice lasts for this visit.
  }
  writeLocaleCookie(prefs.locale);
}

/** The server reads this on the next request, so SSR and the first client render agree on the language. */
function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function apply(prefs: Preferences) {
  const root = document.documentElement;
  // Switch the palette with transitions off, so every colour transition does not fire at once.
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  root.dataset.accent = prefs.theme;
  root.dataset.floral = prefs.floral ? "on" : "off";
  root.lang = prefs.locale;
  void window.getComputedStyle(root).opacity;
  requestAnimationFrame(() => freeze.remove());
}

/** Runs before paint (inlined in the root layout) so the saved theme and a collapsed sidebar never flash. */
export const prefsBootScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}");var r=document.documentElement;if(p.theme)r.dataset.accent=p.theme;if(p.floral===false)r.dataset.floral="off";if(p.locale==="en"||p.locale==="ms")r.lang=p.locale;}catch(e){}if(/(?:^|; )sidebar_state=false(?:;|$)/.test(document.cookie))document.documentElement.dataset.sidebarBoot="collapsed";})();`;

export function PrefsProvider({ children, account, initialLocale }: { children: ReactNode; account?: AccountSeed; initialLocale?: Locale }) {
  // Signed in: seeded synchronously from the server, so the first render already has the right language.
  // Demo / signed out: the server cannot see localStorage, so it passes the language from the kk_locale
  // cookie. Without it the effect below would switch the language while a streamed Suspense boundary
  // is still waiting to hydrate, and that boundary would hydrate against server HTML in another language.
  const [prefs, setState] = useState<Resolved>(() => resolve(account?.initial ?? (initialLocale ? { locale: initialLocale } : {})));
  const latest = useRef(prefs);
  const saver = useRef<PrefsSaver | null>(null);
  // Keep the non-React locale (labels, errors, formatters) in step before children render.
  setCurrentLocale(prefs.locale);

  const commit = useCallback((next: Resolved) => {
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    // The signed-in provider (below) already owns the page; this root one stays out of its way.
    if (account || document.documentElement.dataset[PREFS_SOURCE_ATTR] === "account") return;
    const stored = resolve(readLocal());
    commit(stored);
    apply(stored);
    // Browsers that saved a language before the cookie existed: the next load is consistent.
    writeLocaleCookie(stored.locale);
  }, [account, commit]);

  useLayoutEffect(() => {
    if (!account) return;
    document.documentElement.dataset[PREFS_SOURCE_ATTR] = "account";
    const sender = createPrefsSaver({
      send: async (patch) => {
        const result = await savePrefs(patch);
        if (!result.ok) console.error("kelabkit: preferences were not saved", result.code);
        return result.ok;
      },
    });
    saver.current = sender;
    if (account.initial === null) {
      // Nothing stored for this user yet: carry over what this browser had, once.
      const local = readLocal();
      if (!isEmptyPrefs(local)) {
        const next = resolve(mergePrefs({}, local));
        commit(next);
        apply(next);
        sender.queue(local);
      }
    } else {
      apply(latest.current);
      mirrorDisplay(latest.current);
    }
    const flush = () => void sender.flush();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
      saver.current = null;
    };
    // The seed is read once; later server refreshes must not replace what the user just changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPrefs = useCallback(
    (changes: StoredPrefs) => {
      const current = latest.current;
      // Only what actually differs: a resize that ends where it began saves nothing.
      const changed: StoredPrefs = {};
      const before = { theme: current.theme, floral: current.floral, locale: current.locale, matrixLayout: current.matrixLayout ?? undefined, matrixDensity: current.matrixDensity, matrixSummary: current.matrixSummary, matrixWidths: current.matrixWidths } satisfies StoredPrefs;
      for (const key of Object.keys(changes) as (keyof StoredPrefs)[]) {
        if (changes[key] === undefined) continue;
        if (!samePrefs({ [key]: changes[key] }, { [key]: before[key] })) Object.assign(changed, { [key]: changes[key] });
      }
      if (isEmptyPrefs(changed)) return;
      const next = resolve({ ...before, ...changed });
      commit(next);
      if (touchesDisplay(changed)) apply(next);
      if (account) {
        if (touchesDisplay(changed)) mirrorDisplay(next);
        saver.current?.queue(changed);
        return;
      }
      if (touchesDisplay(changed)) mirrorDisplay(next);
      if (changed.matrixLayout) writeLayout(browserStorage(), changed.matrixLayout);
      if (changed.matrixDensity) writeDensity(browserStorage(), changed.matrixDensity);
      if (changed.matrixSummary) writeSummary(browserStorage(), changed.matrixSummary);
      if (changed.matrixWidths) writeWidths(browserStorage(), changed.matrixWidths);
    },
    [account, commit],
  );

  const value = useMemo(() => ({ ...prefs, setPrefs }), [prefs, setPrefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const context = useContext(PrefsContext);
  if (!context) throw new Error("usePrefs must be used inside PrefsProvider.");
  return context;
}

/** Like usePrefs, but returns null outside the provider (shared UI that must also render in tests). */
export function useOptionalPrefs() {
  return useContext(PrefsContext);
}
