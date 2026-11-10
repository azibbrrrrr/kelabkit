import type { DeepStringify } from "../types";
import type { brandMs } from "./brand.ms";

// English: brand. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const brandEn: DeepStringify<typeof brandMs> = {
  homeLabel: "KelabKit, go to Dashboard",
  docTitle: {
    start: "Getting started",
    members: "Members",
    collections: "Collections",
    payments: "Payments",
    matrix: "Collections matrix",
    reminders: "Reminders",
    reports: "Reports",
    settings: "Settings",
    dashboard: "Dashboard",
    memberDetail: "Member details",
    collectionDetail: "Collection details",
    newCollection: "Add collection",
    newPayment: "Record payment",
    designSystem: "Design system",
  },
};
