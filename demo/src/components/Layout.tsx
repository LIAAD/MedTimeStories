import { useRef, useState, type ReactNode } from "react";
import { Link, matchPath, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { useFilters, useLoaded } from "../data/DataContext";
import { eventUrl, formatDate, reportLabel, truncate } from "../lib/util";
import { EventChip } from "./ui";

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  return (
    <button
      aria-label="Toggle dark mode"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
        setDark(next);
      }}
      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {dark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}

function SearchBar() {
  const { idx } = useLoaded();
  const { filters, setFilters, reset, active, matchEvent } = useFilters();
  const [open, setOpen] = useState(false);
  const results = active ? [...idx.events.values()].filter(matchEvent) : [];
  const field = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div
      className="relative flex flex-wrap items-center gap-2"
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <input
        type="search"
        placeholder="Search events or patients…"
        value={filters.q}
        onChange={(e) => setFilters({ q: e.target.value })}
        className={`${field} w-56`}
      />
      <select aria-label="Event type" value={filters.type} onChange={(e) => setFilters({ type: e.target.value })} className={field}>
        <option value="">All event types</option>
        {idx.eventTypes.map((t) => <option key={t}>{t}</option>)}
      </select>
      <select aria-label="Relation type" value={filters.rel} onChange={(e) => setFilters({ rel: e.target.value })} className={field}>
        <option value="">Any relation</option>
        {idx.relationTypes.map((t) => <option key={t}>{t}</option>)}
      </select>
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" className="accent-indigo-600" checked={filters.coref} onChange={(e) => setFilters({ coref: e.target.checked })} />
        Cross-report relations only
      </label>
      {active && (
        <button onClick={reset} className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">Clear</button>
      )}
      {open && active && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-[34rem] max-w-[90vw] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="px-2 py-1 text-xs text-slate-500">{results.length} matching event(s){results.length > 20 ? " — showing 20" : ""}</p>
          {results.slice(0, 20).map((e) => {
            const r = idx.reports.get(e.reportId)!;
            return (
              <Link
                key={e.id}
                to={eventUrl(idx, e.id)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-medium">{e.surface}</span>
                <EventChip event={e} />
                <span className="ml-auto text-xs text-slate-500">{r.patientId} · {reportLabel(idx, r.id)} · {r.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryButtons() {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const max = useRef(0);
  const i: number = window.history.state?.idx ?? 0;
  max.current = navType === "PUSH" ? i : Math.max(max.current, i);
  void location;
  const btn = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm enabled:hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800";
  return (
    <div className="flex gap-1">
      <button className={btn} disabled={i <= 0} onClick={() => navigate(-1)} aria-label="Back" title="Back">←</button>
      <button className={btn} disabled={i >= max.current} onClick={() => navigate(1)} aria-label="Forward" title="Forward">→</button>
    </div>
  );
}

function Breadcrumb() {
  const { idx } = useLoaded();
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const rep = matchPath("/patient/:patientId/report/:reportId", pathname);
  const pat = matchPath("/patient/:patientId", pathname);
  const pid = rep?.params.patientId ?? pat?.params.patientId;
  const report = rep ? idx.reports.get(rep.params.reportId!) : undefined;
  const ev = sp.get("event") ? idx.events.get(sp.get("event")!) : undefined;
  if (!pid) return null;
  const sep = <span className="text-slate-400">/</span>;
  return (
    <nav aria-label="Breadcrumb" className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 pt-3 text-sm text-slate-500">
      <Link to="/" className="hover:underline">Patients</Link>
      {sep}
      <Link to={`/patient/${encodeURIComponent(pid)}`} className="hover:underline">{pid}</Link>
      {report && (
        <>
          {sep}
          <Link to={`/patient/${encodeURIComponent(pid)}/report/${encodeURIComponent(report.id)}`} className="hover:underline">
            {reportLabel(idx, report.id)} · {report.title} ({formatDate(report.date)})
          </Link>
        </>
      )}
      {ev && report && ev.reportId === report.id && (
        <>
          {sep}
          <span className="font-medium text-slate-800 dark:text-slate-200">{truncate(ev.surface, 40)}</span>
        </>
      )}
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link to="/" className="mr-2 text-lg font-semibold text-indigo-600 dark:text-indigo-400">
            ⚕ MedTime Stories
          </Link>
          <Link to="/patterns" className="text-sm text-slate-600 hover:underline dark:text-slate-300">Patterns</Link>
          <Link to="/words" className="text-sm text-slate-600 hover:underline dark:text-slate-300">Word graph</Link>
          <HistoryButtons />
          <div className="flex-1"><SearchBar /></div>
          <ThemeToggle />
        </div>
      </header>
      <Breadcrumb />
      <main className="mx-auto max-w-[1600px] p-4">{children}</main>
    </div>
  );
}
