import type { DeepStringify } from "../types";
import type { collectionsMs } from "./collections.ms";

// English: collections. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const collectionsEn: DeepStringify<typeof collectionsMs> = {
  amount: {
    anyAmount: "Any amount",
    perMonth: "{amount} a month",
    perPerson: "{amount} each",
  },
  schedule: {
    monthlyWithDay: "{range} · due by day {day} of each month",
    dueOn: "Due {date}",
    noDeadline: "No deadline",
  },
  header: {
    description: "Every club collection: monthly fees, one-off payments and voluntary contributions. Click a card to track each member's payments.",
    add: "Add collection",
  },
  empty: {
    title: "No collections yet",
    description: "Create your first collection, for example the monthly KGK fee or the year-end party. You choose which members take part.",
  },
  stats: {
    active: "Active collections",
    activeHint: "{draft} draft · {completed} completed",
    received: "Received",
    receivedHint: "Confirmed money, active collections",
    balance: "Current balance",
    overdueHint: "{count} overdue charges",
    noOverdue: "No overdue charges",
    pending: "Awaiting review",
    pendingHint: "Not yet counted as received",
  },
  filter: {
    searchPlaceholder: "Search collections…",
    label: "Filter by status",
    all: "All",
  },
  noMatch: {
    title: "No matching collections",
    byQuery: "No collection named \"{query}\" in this view.",
    byStatus: "No collections with status {status}.",
    clear: "Clear filters",
  },
  card: {
    totalCollected: "Total collected",
    contributors: "from {contributors} contributors · {invited} members invited",
    progressLabel: "{name}: received against expected",
    balanceNow: "Current balance",
    upcoming: "upcoming {amount}",
    chipPaid: "Paid {count}",
    chipPartial: "Partial {count}",
    chipUnpaid: "Unpaid {count}",
    chipOverdue: "Overdue {count}",
    chipExempt: "Exempt {count}",
    monthlyNote: "Counted by charge (member × month) up to this month.",
    participants: "{count} participants",
    pendingReview: "{amount} awaiting review",
    restore: "Restore",
  },
};
