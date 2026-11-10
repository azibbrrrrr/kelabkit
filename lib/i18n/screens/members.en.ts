import type { DeepStringify } from "../types";
import type { membersMs } from "./members.ms";

// English: members. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const membersEn: DeepStringify<typeof membersMs> = {
  title: "Members",
  description: "The club's teachers and staff. Click a name to see their collections and payment history.",
  addBulk: "Add in bulk",
  addOne: "Add member",
  addFirst: "Add first member",
  empty: {
    title: "No members yet",
    description: "Add teachers and staff one by one, or paste a list of names at once.",
  },
  stats: {
    total: "Total members",
    inactiveHint: "{count} inactive",
    active: "Active members",
    activeHint: "Shown in the Matrix",
    owing: "With a current balance",
    owingHint: "Total {amount}",
  },
  searchPlaceholder: "Search name or phone…",
  filter: {
    label: "Filter members",
    all: "All",
    active: "Active",
    inactive: "Inactive",
    owing: "Owing",
  },
  columns: {
    name: "Name",
    category: "Category",
    phone: "Phone",
    status: "Status",
    collections: "Collections",
    due: "Current balance",
  },
  overdueCharges: "{count} overdue",
  collectionsCount: "{count} collections",
  noMatch: {
    title: "No matching members",
    owing: "No members with a current balance. Every charge that has fallen due is settled.",
    other: "Try another search or filter.",
    clear: "Clear search",
  },
  status: {
    active: "Active",
    inactive: "Inactive",
  },
};
