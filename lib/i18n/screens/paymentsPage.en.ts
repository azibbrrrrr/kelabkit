import type { DeepStringify } from "../types";
import type { paymentsPageMs } from "./paymentsPage.ms";

// English: paymentsPage. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const paymentsPageEn: DeepStringify<typeof paymentsPageMs> = {
  targetFallbackDonation: "Donation",
  targetFallbackCollection: "Collection",
  memberFallback: "Member",
  columns: {
    date: "Date",
    member: "Member",
    collection: "Collection",
    amount: "Amount",
    method: "Method",
    status: "Status",
  },
  header: {
    title: "Payment records",
    description: "Every payment and donation. Payments are never deleted or edited; corrections are made by reversing with a reason.",
    record: "Record payment",
  },
  stats: {
    receivedLabel: "Received this month",
    receivedHint: "{month} · confirmed only",
    pendingLabel: "Awaiting review",
    pendingHint: "{count} payments not yet confirmed",
    pendingNone: "No pending payments",
    countLabel: "Transactions this month",
    countHint: "Excludes reversed payments",
  },
  tabs: {
    all: "All",
    reviewLong: "Awaiting review",
    reviewShort: "Review",
    reversed: "Reversed",
  },
  review: {
    emptyTitle: "No payments awaiting review",
    emptyDescription: "Payments recorded without “Money received” ticked will appear here to be confirmed.",
    bannerBefore: "{count} payments totalling ",
    bannerAfter: " are not yet counted as received. Confirm once the money reaches your account or hand; reverse if it was not received.",
  },
  filters: {
    searchPlaceholder: "Search member name or reference…",
    method: "Method",
    methodAria: "Filter by method",
    allMethods: "All methods",
    status: "Status",
    statusAria: "Filter by status",
    allStatuses: "All statuses",
    from: "From",
    to: "To",
    anyDate: "Any date",
    clearDate: "Clear",
    clear: "Clear filters",
  },
  empty: {
    noneTitle: "No payments yet",
    noneDescription: "Record the first payment when a member hands over cash or makes a transfer.",
    noneAction: "Record the first payment",
    reversedTitle: "No reversed payments",
    reversedDescription: "Reversed payments stay here with their reason, for the audit trail.",
    noMatchTitle: "No matching payments",
    noMatchDescription: "Try changing the search, method, status or date range.",
  },
  footer: {
    showing: "Showing {shown} of {total} transactions",
    more: "Show more",
  },
};
