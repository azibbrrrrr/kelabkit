import type { DeepStringify } from "../types";
import type { themesMs } from "./themes.ms";

// English: themes. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const themesEn: DeepStringify<typeof themesMs> = {
  rose: { label: "Rose", mood: "Soft & professional" },
  lavender: { label: "Lavender", mood: "Modern & calm" },
  teal: { label: "Teal", mood: "Fresh & balanced" },
  peach: { label: "Peach", mood: "Warm & cheerful" },
  sage: { label: "Sage", mood: "Peaceful & natural" },
};
