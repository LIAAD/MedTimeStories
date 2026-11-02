import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadDataset, type LoadedDataset } from "./loader";
import { graphEventKind } from "../lib/util";
import { DatasetValidationError } from "./schema";
import type { ClinEvent } from "./schema";
import { Spinner } from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; loaded: LoadedDataset };

const DataCtx = createContext<LoadedDataset | null>(null);

export function useLoaded(): LoadedDataset {
  const v = useContext(DataCtx);
  if (!v) throw new Error("useLoaded must be used inside <DataGate>");
  return v;
}

/** Loads the dataset and renders loading / error states until it is ready. */
export function DataGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    loadDataset().then(
      (loaded) => setState({ status: "ready", loaded }),
      (error: Error) => setState({ status: "error", error }),
    );
  }, []);
  useEffect(load, [load]);

  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading dataset…
      </div>
    );
  }
  if (state.status === "error") {
    const issues = state.error instanceof DatasetValidationError ? state.error.issues : [];
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="rounded-lg border border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
          <h1 className="text-lg font-semibold">Could not load dataset</h1>
          <p className="mt-1 text-sm">{state.error.message}</p>
          {issues.length > 0 && (
            <ul className="mt-3 max-h-96 list-disc space-y-1 overflow-auto pl-5 font-mono text-xs">
              {issues.slice(0, 50).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
              {issues.length > 50 && <li>… and {issues.length - 50} more</li>}
            </ul>
          )}
          <button onClick={load} className="mt-4 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }
  return (
    <DataCtx.Provider value={state.loaded}>
      <FilterProvider>{children}</FilterProvider>
    </DataCtx.Provider>
  );
}

export interface Filters {
  q: string;
  type: string;
  rel: string;
  coref: boolean;
}
const EMPTY: Filters = { q: "", type: "", rel: "", coref: false };

interface FilterApi {
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  reset: () => void;
  active: boolean;
  matchEvent: (e: ClinEvent) => boolean;
}
const FilterCtx = createContext<FilterApi | null>(null);

export function useFilters(): FilterApi {
  const v = useContext(FilterCtx);
  if (!v) throw new Error("useFilters must be used inside <DataGate>");
  return v;
}

function FilterProvider({ children }: { children: ReactNode }) {
  const { idx } = useLoaded();
  const [filters, set] = useState<Filters>(EMPTY);
  const api = useMemo<FilterApi>(() => {
    const q = filters.q.trim().toLowerCase();
    const active = !!(q || filters.type || filters.rel || filters.coref);
    return {
      filters,
      active,
      setFilters: (f) => set((cur) => ({ ...cur, ...f })),
      reset: () => set(EMPTY),
      matchEvent: (e) => {
        if (q && !e.surface.toLowerCase().includes(q)) return false;
        if (filters.type && graphEventKind(e).type !== filters.type) return false;
        if (filters.rel && !idx.relationsByEvent.get(e.id)?.some((r) => r.relation.type === filters.rel)) return false;
        if (filters.coref && !idx.relationsByEvent.get(e.id)?.some((r) => idx.events.get(r.other)?.reportId !== e.reportId)) return false;
        return true;
      },
    };
  }, [filters, idx]);
  return <FilterCtx.Provider value={api}>{children}</FilterCtx.Provider>;
}
