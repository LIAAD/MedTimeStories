import type { ReactNode } from "react";
import { typeStyle } from "../lib/colors";
import type { ClinEvent } from "../data/schema";

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function TypeChip({ type, className = "" }: { type: string; className?: string }) {
  const s = typeStyle(type);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.chip} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {type}
    </span>
  );
}

export function EventChip({ event, className = "" }: { event: ClinEvent; className?: string }) {
  const s = typeStyle(event.type);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.chip} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {event.type}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            value === t.id
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm">
      <input type="checkbox" className="accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
