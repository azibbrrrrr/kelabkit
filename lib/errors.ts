// Error codes raised by the backend (demo now, Neon in Phase 2). Their messages live in the
// dictionaries (lib/i18n, `errors.<CODE>`); every new code needs a message in both languages.

import { dictionaries, t, type MessageKey } from "@/lib/i18n";

export type ErrorCode = keyof (typeof dictionaries)["ms"]["errors"];

const codes = Object.keys(dictionaries.ms.errors) as ErrorCode[];

/** Code to message in the current locale, read on each access so it follows the language switch. */
export const errorMessages = {} as Record<ErrorCode, string>;
for (const code of codes) {
  Object.defineProperty(errorMessages, code, { enumerable: true, get: () => t(`errors.${code}` as MessageKey) });
}

export class KelabError extends Error {
  constructor(
    public code: ErrorCode,
    public detail?: string,
  ) {
    super(errorMessages[code]);
  }
}

export function messageFor(error: unknown) {
  if (error instanceof KelabError) return errorMessages[error.code];
  if (error instanceof Error && error.message in errorMessages) return errorMessages[error.message as ErrorCode];
  return t("errorFallback");
}
