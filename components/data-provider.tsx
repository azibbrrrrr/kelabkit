"use client";

import { demoBackend } from "@/lib/backend/demo";
import type { KelabBackend } from "@/lib/backend/types";
import { today } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { buildView, type View } from "@/lib/view";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DataState = {
  data: Snapshot | null;
  view: View | null;
  loading: boolean;
  error: Error | null;
  demo: boolean;
  /** For reads that must not reload the snapshot (e.g. file bytes). Changes go through `run`. */
  backend: KelabBackend;
  refresh: () => Promise<void>;
  /** Runs a change through the backend, then reloads so every screen shows the result. */
  run: <T>(operation: (backend: KelabBackend) => Promise<T>) => Promise<T>;
};

const DataContext = createContext<DataState | null>(null);

export function KelabDataProvider({ children }: { children: ReactNode }) {
  // Phase 2 swaps in the Neon backend here, behind the same interface.
  const backend: KelabBackend = demoBackend;
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await backend.load());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T,>(operation: (backend: KelabBackend) => Promise<T>) => {
      try {
        return await operation(backend);
      } finally {
        // Reload even after a refusal, so a stale screen catches up with what is stored.
        await refresh();
      }
    },
    [backend, refresh],
  );

  const view = useMemo(() => (data ? buildView(data, today()) : null), [data]);

  const value = useMemo<DataState>(
    () => ({ data, view, loading: !data, error, demo: backend.kind === "demo", backend, refresh, run }),
    [data, view, error, backend, refresh, run],
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
