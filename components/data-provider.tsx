"use client";

import { demoBackend } from "@/lib/backend/demo";
import { neonBackend, setSnapshotSink } from "@/lib/backend/neon";
import type { KelabBackend } from "@/lib/backend/types";
import { today } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { buildView, type View } from "@/lib/view";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Shown at once while the change is still on its way; replaced by the stored result, or undone on refusal. */
export type Optimistic = {
  /** Identifies what is pending, so the screen can mark it (a charge id, or "member:collection"). */
  key: string;
  apply: (snapshot: Snapshot) => Snapshot;
};
export type RunOptions = { optimistic?: Optimistic };

type DataState = {
  data: Snapshot | null;
  view: View | null;
  loading: boolean;
  error: Error | null;
  demo: boolean;
  /** For reads that must not reload the snapshot (e.g. file bytes). Changes go through `run`. */
  backend: KelabBackend;
  refresh: () => Promise<void>;
  /**
   * Runs a change through the backend. The stored result arrives with the change itself (neon) or
   * by a reload (demo); the screen never blocks on a second fetch. With `optimistic`, the screen
   * shows the expected result immediately and returns to the stored state if the change is refused.
   */
  run: <T>(operation: (backend: KelabBackend) => Promise<T>, options?: RunOptions) => Promise<T>;
  /** True while any change is on its way to the server. */
  saving: boolean;
  /** Keys of optimistic changes not yet confirmed. */
  pending: ReadonlySet<string>;
};

const DataContext = createContext<DataState | null>(null);

/** A window coming back to the foreground reloads quietly, at most this often. */
const STALE_AFTER_MS = 30_000;
const NO_PENDING: ReadonlySet<string> = new Set();

/** Dev only: `?kk_delay=2500` holds the first load so the skeleton can be inspected and screenshotted. */
function devDelay() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return Promise.resolve();
  const ms = Number(new URLSearchParams(window.location.search).get("kk_delay"));
  return ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 30_000))) : Promise.resolve();
}

export function KelabDataProvider({ mode, children }: { mode: "demo" | "neon"; children: ReactNode }) {
  // The server decides the mode per request (kk_mode cookie, then the Neon Auth session).
  const backend: KelabBackend = mode === "neon" ? neonBackend : demoBackend;
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(NO_PENDING);

  // Bumped whenever a snapshot is applied. A reload that started before a newer snapshot landed is
  // discarded, so a slow response can never put older data over a change that has already been saved.
  const version = useRef(0);
  const current = useRef<Snapshot | null>(null);
  const lastFetch = useRef(0);
  const inflight = useRef(false);
  const savingCount = useRef(0);

  const apply = useCallback((snapshot: Snapshot) => {
    version.current += 1;
    lastFetch.current = Date.now();
    current.current = snapshot;
    setData(snapshot);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    const started = version.current;
    inflight.current = true;
    try {
      if (current.current === null) await devDelay();
      const snapshot = await backend.load();
      if (version.current === started || current.current === null) apply(snapshot);
    } catch (cause) {
      // With data on screen a failed quiet reload changes nothing; the first load shows the error.
      if (current.current === null) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      inflight.current = false;
    }
  }, [backend, apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Changes made by the neon backend return the snapshot their transaction read.
  useEffect(() => {
    if (backend.kind !== "neon") return;
    setSnapshotSink(apply);
    return () => setSnapshotSink(null);
  }, [backend, apply]);

  // Stale-while-revalidate: the screen keeps what it has; coming back to the window refreshes it.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      if (inflight.current || savingCount.current > 0 || current.current === null) return;
      if (Date.now() - lastFetch.current < STALE_AFTER_MS) return;
      void refresh();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [refresh]);

  const run = useCallback(
    async <T,>(operation: (backend: KelabBackend) => Promise<T>, options?: RunOptions) => {
      const before = current.current;
      const started = version.current;
      const optimistic = options?.optimistic;
      savingCount.current += 1;
      setSaving((n) => n + 1);
      if (optimistic && before) {
        current.current = optimistic.apply(before);
        setData(current.current);
        setPending((keys) => new Set(keys).add(optimistic.key));
      }
      let failed = false;
      try {
        return await operation(backend);
      } catch (cause) {
        failed = true;
        // Refused: put back what was stored, unless a newer snapshot has already replaced it.
        if (optimistic && before && version.current === started) {
          current.current = before;
          setData(before);
        }
        throw cause;
      } finally {
        savingCount.current -= 1;
        setSaving((n) => n - 1);
        if (optimistic)
          setPending((keys) => {
            const next = new Set(keys);
            next.delete(optimistic.key);
            return next;
          });
        // No snapshot came back with the change (demo backend), or it was refused: catch up with what
        // is stored. The demo reads local storage, so waiting is instant; signed-in mode never waits.
        if (failed || version.current === started) {
          const reload = refresh();
          if (backend.kind === "demo") await reload;
        }
      }
    },
    [backend, refresh],
  );

  const view = useMemo(() => (data ? buildView(data, today()) : null), [data]);

  const value = useMemo<DataState>(
    () => ({ data, view, loading: !data, error, demo: backend.kind === "demo", backend, refresh, run, saving: saving > 0, pending }),
    [data, view, error, backend, refresh, run, saving, pending],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useKelab() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useKelab must be used inside KelabDataProvider.");
  return context;
}

/** For screens rendered behind the data gate, where the snapshot is always loaded. */
export function useSnapshot() {
  const { data, view } = useKelab();
  if (!data || !view) throw new Error("useSnapshot called before the data loaded.");
  return { data, view };
}
