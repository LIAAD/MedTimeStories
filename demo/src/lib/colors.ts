export interface TypeStyle {
  mark: string;
  chip: string;
  dot: string;
  hex: string;
}

const STYLES: Record<string, TypeStyle> = {
  PROBLEM: {
    mark: "bg-rose-200 text-rose-950 dark:bg-rose-500/30 dark:text-rose-50",
    chip: "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-200",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
  TREATMENT: {
    mark: "bg-emerald-200 text-emerald-950 dark:bg-emerald-500/30 dark:text-emerald-50",
    chip: "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-200",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
  TEST: {
    mark: "bg-sky-200 text-sky-950 dark:bg-sky-500/30 dark:text-sky-50",
    chip: "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-200",
    dot: "bg-sky-500",
    hex: "#0ea5e9",
  },
  "GENERAL EVENT": {
    mark: "bg-slate-200 text-slate-900 dark:bg-slate-500/30 dark:text-slate-50",
    chip: "border-slate-400 bg-slate-100 text-slate-800 dark:border-slate-500/60 dark:bg-slate-500/10 dark:text-slate-200",
    dot: "bg-slate-500",
    hex: "#64748b",
  },
  "SPECIALIZED EVENT": {
    mark: "bg-indigo-200 text-indigo-950 dark:bg-indigo-500/30 dark:text-indigo-50",
    chip: "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-200",
    dot: "bg-indigo-500",
    hex: "#6366f1",
  },
  "PRINCIPAL DIAGNOSIS": {
    mark: "bg-red-200 text-red-950 dark:bg-red-500/30 dark:text-red-50",
    chip: "border-red-400 bg-red-50 text-red-800 dark:border-red-500/60 dark:bg-red-500/10 dark:text-red-200",
    dot: "bg-red-500",
    hex: "#ef4444",
  },
  "CHARACTERIZATION OF THE DISEASE": {
    mark: "bg-pink-200 text-pink-950 dark:bg-pink-500/30 dark:text-pink-50",
    chip: "border-pink-400 bg-pink-50 text-pink-800 dark:border-pink-500/60 dark:bg-pink-500/10 dark:text-pink-200",
    dot: "bg-pink-500",
    hex: "#ec4899",
  },
  INTERCURRENCE: {
    mark: "bg-fuchsia-200 text-fuchsia-950 dark:bg-fuchsia-500/30 dark:text-fuchsia-50",
    chip: "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/60 dark:bg-fuchsia-500/10 dark:text-fuchsia-200",
    dot: "bg-fuchsia-500",
    hex: "#d946ef",
  },
  "PERSONAL HISTORY": {
    mark: "bg-violet-200 text-violet-950 dark:bg-violet-500/30 dark:text-violet-50",
    chip: "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-200",
    dot: "bg-violet-500",
    hex: "#8b5cf6",
  },
  "SIGN OR SYMPTOM": {
    mark: "bg-orange-200 text-orange-950 dark:bg-orange-500/30 dark:text-orange-50",
    chip: "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-500/60 dark:bg-orange-500/10 dark:text-orange-200",
    dot: "bg-orange-500",
    hex: "#f97316",
  },
  "TREATMENT RESPONSE": {
    mark: "bg-yellow-200 text-yellow-950 dark:bg-yellow-500/30 dark:text-yellow-50",
    chip: "border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-500/60 dark:bg-yellow-500/10 dark:text-yellow-200",
    dot: "bg-yellow-500",
    hex: "#eab308",
  },
  EXAMINATION: {
    mark: "bg-blue-200 text-blue-950 dark:bg-blue-500/30 dark:text-blue-50",
    chip: "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-200",
    dot: "bg-blue-500",
    hex: "#3b82f6",
  },
  "EXAMINATION RESULT": {
    mark: "bg-cyan-200 text-cyan-950 dark:bg-cyan-500/30 dark:text-cyan-50",
    chip: "border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-200",
    dot: "bg-cyan-500",
    hex: "#06b6d4",
  },
  "MEDICAL PROCEDURE": {
    mark: "bg-teal-200 text-teal-950 dark:bg-teal-500/30 dark:text-teal-50",
    chip: "border-teal-400 bg-teal-50 text-teal-800 dark:border-teal-500/60 dark:bg-teal-500/10 dark:text-teal-200",
    dot: "bg-teal-500",
    hex: "#14b8a6",
  },
  "DRUG ADMINISTRATION ROUTE": {
    mark: "bg-stone-300 text-stone-950 dark:bg-stone-500/40 dark:text-stone-50",
    chip: "border-stone-400 bg-stone-100 text-stone-800 dark:border-stone-500/60 dark:bg-stone-500/10 dark:text-stone-200",
    dot: "bg-stone-500",
    hex: "#78716c",
  },
  TIME: {
    mark: "bg-lime-200 text-lime-950 dark:bg-lime-500/30 dark:text-lime-50",
    chip: "border-lime-400 bg-lime-50 text-lime-800 dark:border-lime-500/60 dark:bg-lime-500/10 dark:text-lime-200",
    dot: "bg-lime-500",
    hex: "#84cc16",
  },
  "TIME (ADMISSION)": {
    mark: "bg-cyan-200 text-cyan-950 dark:bg-cyan-500/30 dark:text-cyan-50",
    chip: "border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-200",
    dot: "bg-cyan-500",
    hex: "#06b6d4",
  },
  "TIME (DISCHARGE)": {
    mark: "bg-orange-200 text-orange-950 dark:bg-orange-500/30 dark:text-orange-50",
    chip: "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-500/60 dark:bg-orange-500/10 dark:text-orange-200",
    dot: "bg-orange-500",
    hex: "#f97316",
  },
  "TIME (DURATION)": {
    mark: "bg-purple-200 text-purple-950 dark:bg-purple-500/30 dark:text-purple-50",
    chip: "border-purple-400 bg-purple-50 text-purple-800 dark:border-purple-500/60 dark:bg-purple-500/10 dark:text-purple-200",
    dot: "bg-purple-500",
    hex: "#a855f7",
  },
  "TIME (SET)": {
    mark: "bg-sky-200 text-sky-950 dark:bg-sky-500/30 dark:text-sky-50",
    chip: "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-200",
    dot: "bg-sky-500",
    hex: "#0ea5e9",
  },
  "TIME (TIME)": {
    mark: "bg-pink-200 text-pink-950 dark:bg-pink-500/30 dark:text-pink-50",
    chip: "border-pink-400 bg-pink-50 text-pink-800 dark:border-pink-500/60 dark:bg-pink-500/10 dark:text-pink-200",
    dot: "bg-pink-500",
    hex: "#ec4899",
  },
  OCCURRENCE: {
    mark: "bg-amber-200 text-amber-950 dark:bg-amber-500/30 dark:text-amber-50",
    chip: "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
};

const FALLBACK: TypeStyle[] = [
  {
    mark: "bg-violet-200 text-violet-950 dark:bg-violet-500/30 dark:text-violet-50",
    chip: "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-200",
    dot: "bg-violet-500",
    hex: "#8b5cf6",
  },
  {
    mark: "bg-teal-200 text-teal-950 dark:bg-teal-500/30 dark:text-teal-50",
    chip: "border-teal-400 bg-teal-50 text-teal-800 dark:border-teal-500/60 dark:bg-teal-500/10 dark:text-teal-200",
    dot: "bg-teal-500",
    hex: "#14b8a6",
  },
  {
    mark: "bg-fuchsia-200 text-fuchsia-950 dark:bg-fuchsia-500/30 dark:text-fuchsia-50",
    chip: "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/60 dark:bg-fuchsia-500/10 dark:text-fuchsia-200",
    dot: "bg-fuchsia-500",
    hex: "#d946ef",
  },
  {
    mark: "bg-lime-200 text-lime-950 dark:bg-lime-500/30 dark:text-lime-50",
    chip: "border-lime-400 bg-lime-50 text-lime-800 dark:border-lime-500/60 dark:bg-lime-500/10 dark:text-lime-200",
    dot: "bg-lime-500",
    hex: "#84cc16",
  },
];

export function typeStyle(type: string): TypeStyle {
  const known = STYLES[type.toUpperCase()];
  if (known) return known;
  let h = 0;
  for (const c of type) h = (h + c.charCodeAt(0)) % FALLBACK.length;
  return FALLBACK[h];
}

/** Preferred lane order in graphs; unknown types are appended. */
export const TYPE_ORDER = ["PROBLEM", "TEST", "TREATMENT", "OCCURRENCE"];
