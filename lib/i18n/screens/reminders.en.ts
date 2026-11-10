import type { DeepStringify } from "../types";
import type { remindersMs } from "./reminders.ms";

// English: reminders. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const remindersEn: DeepStringify<typeof remindersMs> = {
  title: "Reminders",
  description:
    "Prepare polite follow-up messages for members who still owe a balance. Messages are copied or opened in WhatsApp; nothing is sent automatically.",
  empty: {
    title: "No active compulsory collections",
    description: "Reminders only apply to active one-off or monthly collections.",
    action: "Create collection",
  },
  template: {
    title: "Message template",
    description: "Click a placeholder to insert it at the cursor. Any line containing {tarikh} is dropped when there is no due date.",
    reset: "Reset template",
    placeholdersLabel: "Placeholders",
    label: "Message template",
    savedNote: "The template is saved in this browser. Messages you have edited for a member do not change when the template changes. Messages are always written in Bahasa Melayu.",
  },
  placeholderHints: {
    nama: "Member name",
    kutipan: "Collection name (and month)",
    baki: "Outstanding balance",
    tarikh: "Payment due date",
    bendahari: "Treasurer name",
    kelab: "Club name",
  },
  filters: {
    collection: "Collection",
    collectionPlaceholder: "Select a collection",
    month: "Month",
    allMonths: "All months so far",
    label: "Filter members",
    unpaid: "Unpaid",
    partial: "Partial",
    overdue: "Overdue",
    all: "All with a balance",
  },
  scopeNote: "Only active members who still owe a balance are listed. Members who have paid in full, are exempt, are not in the collection, or whose month is still ahead are not included.",
  voluntaryNote: "{names} not listed because voluntary contributions do not create a debt.",
  allPaid: {
    title: "Everyone has paid",
    description: "No members have a balance for {collection}.",
  },
  group: {
    title: "Group message",
    description: "A general reminder for the WhatsApp group. No individual names or amounts, so no member feels singled out.",
    copyAll: "Copy all",
    show: "Show message",
    hide: "Hide message",
    copied: "Group message copied.",
  },
  summary: {
    membersBalance: "{count} members · balance",
    reviewHint: "Check each message before sending.",
  },
  noneInFilter: {
    title: "No members in this filter",
    description: "Choose another filter to see members who still owe a balance.",
  },
  row: {
    dueDate: "Due {date}",
    noDueDate: "No due date",
    balance: "Balance",
    pending: "Awaiting review {amount}",
    copyMessage: "Copy message",
    copiedFor: "Message for {name} copied.",
    openWhatsapp: "Open WhatsApp",
    phoneInvalid: "Phone number is not valid",
    phoneMissing: "No phone number",
    closeMessage: "Close message",
    viewEdit: "View and edit message",
    messageFor: "Message for {name}",
    messageForEdited: "Message for {name} (edited)",
    useTemplateAgain: "Use template again",
  },
  copyFailed: "The message could not be copied. Open the message, select the text and copy it manually.",
};
