import type { DeepStringify } from "../types";
import type { attachmentsMs } from "./attachments.ms";

// English: attachments. Typed from the Bahasa Melayu file, so a missing or extra key fails the type check.
export const attachmentsEn: DeepStringify<typeof attachmentsMs> = {
  status: {
    checking: "Checking…",
    compressing: "Compressing image…",
    saving: "Saving…",
    done: "Done",
  },
  drop: {
    label: "Attach proof: drag files here, choose files or paste an image",
    hint: "Drag files here or paste an image (Ctrl/⌘ V). Images or PDF, 10 MB maximum each.",
    pick: "Choose files",
    paste: "Paste image",
    noImage: "There is no image on the clipboard.",
    clipboardFailed: "The clipboard could not be read. Click this box and press Ctrl/⌘ V.",
    dismiss: "Dismiss message for {name}",
  },
  field: {
    title: "Proof of payment (optional)",
    willAttach: "will be attached on save",
    removeFromList: "Remove {name} from the list",
  },
  stagedFailed: "The payment was saved, but the proof could not be attached: {error} Attach it again from the payment history.",
  chip: {
    titleOne: "{count} proof attachment",
    titleMany: "{count} proof attachments",
    pending: "Has proof · {count}",
    countOne: "{count} attachment",
    countMany: "{count} attachments",
  },
  attach: {
    button: "Attach proof",
    full: "Already {max} attachments. Remove one first.",
  },
  list: {
    label: "Proof of payment attachments",
    view: "View {name}",
    viewButton: "View",
    removed: "Removed {when}: {reason}",
    remove: "Remove {name}",
    removeTitle: "Remove attachment",
  },
};
