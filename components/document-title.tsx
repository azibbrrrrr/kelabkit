"use client";

import { useT } from "@/lib/i18n/react";
import type { MessageKey } from "@/lib/i18n/types";
import { useEffect } from "react";

type TitleKey = Extract<MessageKey, `brand.docTitle.${string}`>;

/**
 * Static `metadata` cannot read the browser's locale, so each route keeps its Bahasa Melayu title
 * there (first paint, crawlers) and renders this to follow the language switch afterwards.
 * The suffix matches `title.template` in app/layout.tsx.
 */
export function useDocumentTitle(key: TitleKey) {
  const t = useT();
  const title = `${t(key)} | KelabKit`;
  useEffect(() => {
    document.title = title;
    // Next applies the route's metadata title after children mount on client navigation; set again once it has.
    const frame = requestAnimationFrame(() => {
      document.title = title;
    });
    return () => cancelAnimationFrame(frame);
  }, [title]);
}

export function DocumentTitle({ k }: { k: TitleKey }) {
  useDocumentTitle(k);
  return null;
}
