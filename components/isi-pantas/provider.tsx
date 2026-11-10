"use client";

// Isi Pantas conversation state. Lives in React context under the data provider, so it
// survives navigation and closing the sheet, and is gone on reload: a paste is a draft, not
// data. Nothing is stored until the treasurer accepts a suggestion; accepting records a
// payment through `run()`, the same path as the cell editor, so every backend rule applies.

import type { StagedFile } from "@/components/attachments";
import { useKelab } from "@/components/data-provider";
import type { KelabBackend } from "@/lib/backend/types";
import { KelabError, messageFor } from "@/lib/errors";
import { today } from "@/lib/format";
import { t } from "@/lib/i18n";
import { chargeFor, isConfident, parsePaste, reassess, type ParseContext, type Suggestion } from "@/lib/isi-pantas/parse";
import type { Snapshot } from "@/lib/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export type ItemStatus = "pending" | "applying" | "accepted" | "dismissed" | "undone";
export type Item = {
  s: Suggestion;
  /** Idempotency key, fixed per suggestion: a retry after a lost response records once. */
  key: string;
  status: ItemStatus;
  paymentId: string | null;
  /** Proof picked with the paste; stored against the payment this card creates, when accepted. */
  files: StagedFile[];
  /** Why the last accept or undo failed; shown on the card. */
  error: string | null;
};
export type Turn = {
  id: string;
  text: string;
  phase: "thinking" | "ready";
  /** Memproses step reached, 0..3. */
  step: number;
  items: Item[];
};
export type Ghost = { amountSen: number; state: "suggested" | "recorded"; itemId: string };
export type Pick = { memberId: string; collectionId: string | null; periodId: string | null };

export const UNDO_REASON = "Dibatalkan dari Isi Pantas (buat asal)";
export const ghostKey = (memberId: string, collectionId: string, periodId: string | null) => `${memberId}|${collectionId}|${periodId ?? ""}`;

type IsiPantasState = {
  open: boolean;
  openSheet: (opener?: Element | null) => void;
  close: () => void;
  /** The element focus returns to when the sheet closes. */
  opener: React.RefObject<HTMLElement | null>;
  draft: string;
  setDraft: (text: string) => void;
  /** Proof chosen in the composer; every suggestion from the next paste carries it. */
  draftFiles: StagedFile[];
  setDraftFiles: (files: StagedFile[]) => void;
  turns: Turn[];
  busy: boolean;
  submit: () => void;
  accept: (itemIds: string[]) => Promise<void>;
  acceptConfident: () => Promise<void>;
  dismiss: (itemId: string, back?: boolean) => void;
  edit: (itemId: string, pick: Pick) => void;
  undo: (turnId: string) => Promise<void>;
  clear: () => void;
  ghosts: Map<string, Ghost>;
  /** Opens the sheet and brings a suggestion's card into view. */
  focusCard: (itemId: string) => void;
  /** Bumped when a paste is fully accepted: the sheet drifts petals. */
  celebrate: number;
};

const IsiPantasContext = createContext<IsiPantasState | null>(null);

const contextOf = (data: Snapshot): ParseContext => ({ today: today(), ...data });
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Typing somewhere: "/" belongs to the field, not to the shortcut. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=combobox], [role=textbox]"));
}

async function record(backend: KelabBackend, data: Snapshot, item: Item) {
  const { s } = item;
  if (!s.memberId || !s.collectionId) throw new KelabError("CHARGE_NOT_FOUND");
  const collection = data.collections.find((row) => row.id === s.collectionId);
  if (!collection) throw new KelabError("COLLECTION_NOT_FOUND");
  const common = {
    idempotencyKey: item.key,
    memberId: s.memberId,
    method: s.method,
    paidOn: s.paidOn,
    reference: null,
    note: `Isi Pantas: ${s.quote}`.slice(0, 200),
    // A transfer is "Menunggu Semakan" until the treasurer sees it in the account.
    confirmed: s.method !== "transfer",
  };
  if (collection.type === "voluntary") return backend.recordContribution({ ...common, collectionId: collection.id, amount: s.amountSen });
  const charge = chargeFor(data, s.memberId, collection.id, s.periodId);
  if (!charge) throw new KelabError("CHARGE_NOT_FOUND");
  return backend.recordPayment({ ...common, allocations: [{ chargeId: charge.id, amount: s.amountSen }] });
}

export function IsiPantasProvider({ children }: { children: ReactNode }) {
  const { data, run } = useKelab();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<StagedFile[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [celebrate, setCelebrate] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const draftFilesRef = useRef(draftFiles);
  draftFilesRef.current = draftFiles;
  const dataRef = useRef(data);
  dataRef.current = data;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const openSheet = useCallback((from?: Element | null) => {
    const el = from === undefined ? document.activeElement : from;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // "/" opens Isi Pantas from anywhere, except while typing or inside another dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isTyping(event.target)) return;
      if (document.querySelector("[role=dialog][aria-modal=true], [role=alertdialog]")) return;
      event.preventDefault();
      // Already open: "/" jumps to the composer and keeps the original opener.
      if (openRef.current) document.getElementById("isi-input")?.focus();
      else openSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSheet]);

  const patchItems = useCallback((update: (item: Item) => Item) => {
    setTurns((current) => current.map((turn) => ({ ...turn, items: turn.items.map(update) })));
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || !dataRef.current) return;
    const id = `t${Date.now().toString(36)}`;
    setTurns((current) => [...current, { id, text, phase: "thinking", step: 0, items: [] }]);
    setDraft("");
    const files = draftFilesRef.current;
    setDraftFiles([]);
    // The reading is instant; the steps show what is being checked, briefly.
    const stepMs = reducedMotion() ? 60 : 320;
    [1, 2, 3].forEach((step) =>
      setTimeout(() => setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, step } : turn))), step * stepMs),
    );
    setTimeout(() => {
      const snapshot = dataRef.current;
      const suggestions = snapshot ? parsePaste(text, contextOf(snapshot), { idPrefix: `${id}-` }) : [];
      const items: Item[] = suggestions.map((s) => ({ s, key: `isi-${crypto.randomUUID()}`, status: "pending", paymentId: null, files, error: null }));
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, phase: "ready", step: 4, items } : turn)));
    }, 4 * stepMs);
  }, [draft]);

  const findItems = (ids: string[]) => {
    const wanted = new Set(ids);
    return turnsRef.current.flatMap((turn) => turn.items).filter((item) => wanted.has(item.s.id) && (item.status === "pending" || item.status === "undone"));
  };

  const accept = useCallback(
    async (ids: string[]) => {
      const snapshot = dataRef.current;
      const items = findItems(ids);
      if (!snapshot || !items.length) return;
      const wanted = new Set(items.map((item) => item.s.id));
      patchItems((item) => (wanted.has(item.s.id) ? { ...item, status: "applying", error: null } : item));
      const results = new Map<string, { paymentId: string } | { error: string }>();
      let proofFailed = 0;
      await run(async (backend) => {
        // One at a time: each payment is checked against the balance the previous one left.
        for (const item of items) {
          try {
            const paymentId = await record(backend, snapshot, item);
            results.set(item.s.id, { paymentId });
            // The payment stands even if its proof cannot be stored; the treasurer is told.
            if (item.files.length) await backend.addAttachments(paymentId, item.files.map((row) => row.file)).catch(() => void proofFailed++);
          } catch (cause) {
            results.set(item.s.id, { error: messageFor(cause) });
          }
        }
      }).catch(() => undefined);
      patchItems((item) => {
        const result = results.get(item.s.id);
        if (!wanted.has(item.s.id)) return item;
        if (!result) return { ...item, status: "pending", error: t("quickFill.toast.wentWrong") };
        if ("error" in result) return { ...item, status: "pending", error: result.error };
        return { ...item, status: "accepted", paymentId: result.paymentId, error: null };
      });
      if (proofFailed) toast.warning(t("quickFill.toast.proofFailed", { count: proofFailed }), { duration: 10000 });
      const ok = [...results.values()].filter((result) => "paymentId" in result).length;
      const failed = items.length - ok;
      if (items.length > 1) {
        const turnId = turnsRef.current.find((turn) => turn.items.some((item) => wanted.has(item.s.id)))?.id;
        if (ok > 0)
          toast.success(failed ? t("quickFill.toast.recordedFailed", { ok, failed }) : t("quickFill.toast.recorded", { ok }), {
            action: turnId ? { label: t("quickFill.toast.undo"), onClick: () => void undoRef.current(turnId) } : undefined,
          });
        else toast.error(t("quickFill.toast.noneRecorded"));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs
    [patchItems, run],
  );

  const acceptConfident = useCallback(async () => {
    const ids = turnsRef.current.flatMap((turn) => turn.items).filter((item) => item.status === "pending" && isConfident(item.s)).map((item) => item.s.id);
    await accept(ids);
  }, [accept]);

  const dismiss = useCallback(
    (itemId: string, back = false) =>
      patchItems((item) =>
        item.s.id !== itemId ? item : back ? (item.status === "dismissed" ? { ...item, status: "pending" } : item) : item.status === "pending" ? { ...item, status: "dismissed", error: null } : item,
      ),
    [patchItems],
  );

  const edit = useCallback(
    (itemId: string, pick: Pick) => {
      const snapshot = dataRef.current;
      if (!snapshot) return;
      patchItems((item) => (item.s.id === itemId && item.status === "pending" ? { ...item, s: reassess(item.s, contextOf(snapshot), pick), error: null } : item));
    },
    [patchItems],
  );

  const undo = useCallback(
    async (turnId: string) => {
      const turn = turnsRef.current.find((row) => row.id === turnId);
      const items = turn?.items.filter((item) => item.status === "accepted" && item.paymentId) ?? [];
      if (!items.length) return;
      const results = new Map<string, string | null>();
      await run(async (backend) => {
        for (const item of items) {
          try {
            await backend.reversePayment(item.paymentId!, UNDO_REASON);
            results.set(item.s.id, null);
          } catch (cause) {
            results.set(item.s.id, messageFor(cause));
          }
        }
      }).catch(() => undefined);
      patchItems((item) => {
        if (!results.has(item.s.id)) return item;
        const error = results.get(item.s.id);
        // The reversed payment stays in history; the suggestion can be accepted again with a new key.
        return error ? { ...item, error } : { ...item, status: "undone", paymentId: null, key: `isi-${crypto.randomUUID()}`, error: null };
      });
      const failed = [...results.values()].filter(Boolean).length;
      if (failed) toast.error(t("quickFill.toast.undoFailed", { count: failed }));
      else toast.success(t("quickFill.toast.undone", { count: items.length }));
    },
    [patchItems, run],
  );
  const undoRef = useRef(undo);
  undoRef.current = undo;

  const clear = useCallback(() => {
    setTurns([]);
    setDraft("");
    setDraftFiles([]);
  }, []);

  const focusCard = useCallback((itemId: string) => {
    setOpen(true);
    const reveal = (tries: number) => {
      const card = document.getElementById(`isi-card-${itemId}`);
      if (!card) {
        if (tries > 0) requestAnimationFrame(() => reveal(tries - 1));
        return;
      }
      card.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
      card.focus({ preventScroll: true });
      card.classList.remove("isi-flash");
      void card.offsetWidth;
      card.classList.add("isi-flash");
    };
    requestAnimationFrame(() => reveal(30));
  }, []);

  // Petals once a paste has nothing left to decide and something was recorded.
  const settled = turns.filter((turn) => turn.phase === "ready" && turn.items.some((item) => item.status === "accepted") && turn.items.every((item) => item.status === "accepted" || item.status === "dismissed")).length;
  const lastSettled = useRef(0);
  useEffect(() => {
    if (settled > lastSettled.current) setCelebrate((n) => n + 1);
    lastSettled.current = settled;
  }, [settled]);

  const ghosts = useMemo(() => {
    const map = new Map<string, Ghost>();
    for (const turn of turns)
      for (const item of turn.items) {
        const { memberId, collectionId, periodId, amountSen } = item.s;
        if (!memberId || !collectionId) continue;
        const state = item.status === "accepted" ? "recorded" : item.status === "pending" || item.status === "applying" ? "suggested" : null;
        if (state) map.set(ghostKey(memberId, collectionId, periodId), { amountSen, state, itemId: item.s.id });
      }
    return map;
  }, [turns]);

  const busy = turns.some((turn) => turn.phase === "thinking" || turn.items.some((item) => item.status === "applying"));

  const value = useMemo<IsiPantasState>(
    () => ({ open, openSheet, close, opener, draft, setDraft, draftFiles, setDraftFiles, turns, busy, submit, accept, acceptConfident, dismiss, edit, undo, clear, ghosts, focusCard, celebrate }),
    [open, openSheet, close, draft, draftFiles, turns, busy, submit, accept, acceptConfident, dismiss, edit, undo, clear, ghosts, focusCard, celebrate],
  );
  return <IsiPantasContext.Provider value={value}>{children}</IsiPantasContext.Provider>;
}

export function useIsiPantas() {
  const context = useContext(IsiPantasContext);
  if (!context) throw new Error("useIsiPantas must be used inside IsiPantasProvider.");
  return context;
}

/** Money recorded by a paste, for the Selesai card. */
export function turnSummary(turn: Turn) {
  const accepted = turn.items.filter((item) => item.status === "accepted");
  return {
    total: accepted.reduce((sum, item) => sum + item.s.amountSen, 0),
    count: accepted.length,
    pending: accepted.filter((item) => item.s.method === "transfer").length,
    undone: turn.items.filter((item) => item.status === "undone").length,
    open: turn.items.filter((item) => item.status === "pending" || item.status === "applying").length,
  };
}
