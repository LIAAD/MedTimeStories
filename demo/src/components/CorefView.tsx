import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Patient } from "../data/schema";
import { useFilters, useLoaded } from "../data/DataContext";
import { crossReportRelations, eventUrl, formatDate, reportLabel } from "../lib/util";
import { Card, EmptyState } from "./ui";

export default function CorefView({ patient }: { patient: Patient }) {
  const { idx } = useLoaded();
  const { active, matchEvent } = useFilters();
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const allRelations = useMemo(
    () => crossReportRelations(idx, patient),
    [idx, patient],
  );
  const linkTypes = useMemo(() => [...new Set(allRelations.map((r) => r.type))].sort(), [allRelations]);
  const relations = useMemo(
    () =>
      allRelations
        .filter((r) => !hiddenTypes.has(r.type))
        .filter((r) => !active || matchEvent(r.source) || matchEvent(r.target)),
    [allRelations, hiddenTypes, active, matchEvent],
  );
  const toggleType = (t: string) =>
    setHiddenTypes((cur) => {
      const n = new Set(cur);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Cross-report relations:</span>
        {linkTypes.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              hiddenTypes.has(t)
                ? "border-slate-300 text-slate-400 line-through dark:border-slate-700"
                : "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{relations.length} relation(s) between different reports.</p>
      {relations.length === 0 && <EmptyState title="No cross-report relations match" hint="Adjust the filters above." />}
      {relations.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                r.type === "IDENTITY"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
              }`}
            >
              {r.type}
            </span>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            {[r.source, r.target].map((e, i) => {
              const rep = idx.reports.get(e.reportId)!;
              return (
                <div key={e.id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-400">→</span>}
                  <div className="rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
                    <div className="mb-1 text-[11px] text-slate-500">
                      {reportLabel(idx, rep.id)} · {rep.type} · {formatDate(rep.date)}
                    </div>
                    <Link
                      to={eventUrl(idx, e.id)}
                      title={`${rep.title} @ ${e.start}`}
                      className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-indigo-500/20"
                    >
                      {e.surface} <span className="text-xs text-slate-400">@{e.start}</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
