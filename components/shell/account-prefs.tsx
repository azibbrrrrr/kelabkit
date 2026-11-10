import { PrefsProvider } from "@/components/prefs-provider";
import { accountBootScript, type StoredPrefs } from "@/lib/prefs";
import type { ReactNode } from "react";

/** Signed-in shell: preferences come from the account (loaded with the session, no extra request). */
export function AccountPrefs({ prefs, children }: { prefs: StoredPrefs | null; children: ReactNode }) {
  const script = accountBootScript(prefs);
  return (
    <PrefsProvider account={{ initial: prefs }}>
      {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
      {children}
    </PrefsProvider>
  );
}
