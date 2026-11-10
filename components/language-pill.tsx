"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/react";
import { usePrefs } from "@/components/prefs-provider";
import { cn } from "@/lib/utils";

const item =
  "h-7 min-w-9 rounded-[7px]! px-2 text-xs font-normal hover:bg-primary-tint data-[state=on]:bg-primary-light data-[state=on]:font-semibold data-[state=on]:text-primary-strong";

/**
 * The BM | EN switch. A single choice that cannot be pressed off. Switching only changes the
 * stored display preference: club data is never touched. The page below re-mounts on a switch,
 * so focus is handed back to the same control (found by `placement`) once it has re-rendered.
 */
export function LanguagePill({ placement, className }: { placement: "topbar" | "menu" | "settings"; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const { setPrefs } = usePrefs();

  return (
    <ToggleGroup
      type="single"
      value={locale}
      data-language-pill={placement}
      aria-label={t("lang.label")}
      spacing={0}
      onValueChange={(next) => {
        if (!isLocale(next) || next === locale) return;
        setPrefs({ locale: next });
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-language-pill="${placement}"] [data-state="on"]`)?.focus(),
        );
      }}
      className={cn("gap-0 rounded-[10px] border border-border bg-card p-0.5", className)}
    >
      <ToggleGroupItem value="ms" lang="ms" title={t("lang.msName")} className={item}>
        {t("lang.ms")}<span className="sr-only">, {t("lang.msName")}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="en" lang="en" title={t("lang.enName")} className={item}>
        {t("lang.en")}<span className="sr-only">, {t("lang.enName")}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
