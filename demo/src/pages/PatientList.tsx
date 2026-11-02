import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFilters, useLoaded } from "../data/DataContext";
import { Card, EmptyState } from "../components/ui";

export default function PatientList() {
  const { data, idx } = useLoaded();
  const { filters, active, matchEvent } = useFilters();
  const [sortKey, setSortKey] = useState<"id" | "reports" | "events" | "chains">("id");

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return data.patients
      .map((p) => {
        const s = idx.patientStats.get(p.id)!;
        const matches = active ? p.reports.reduce((n, r) => n + r.events.filter(matchEvent).length, 0) : 0;
        const idMatch = !!q && p.id.toLowerCase().includes(q);
        return { p, s, matches, show: !active || idMatch || matches > 0 };
      })
      .filter((r) => r.show)
      .sort((a, b) => {
        if (sortKey === "id") return a.p.id.localeCompare(b.p.id);
        const v = (r: typeof a) => (sortKey === "reports" ? r.s.reportCount : sortKey === "events" ? r.s.eventCount : r.s.crossChainCount);
        return v(b) - v(a);
      });
  }, [data, idx, active, filters.q, matchEvent, sortKey]);

  const th = (key: typeof sortKey, label: string) => (
    <th className="px-4 py-2 text-left">
      <button onClick={() => setSortKey(key)} className={sortKey === key ? "text-indigo-600 dark:text-indigo-400" : ""}>
        {label}{sortKey === key ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Patients</h1>
      {data.patients.length === 0 ? (
        <EmptyState title="The dataset contains no patients" />
      ) : rows.length === 0 ? (
        <EmptyState title="No patients match the current search" hint="Clear or relax the filters in the header." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                {th("id", "Patient")}
                {th("reports", "Reports")}
                {th("events", "Events")}
                {th("chains", "Cross-report chains")}
                {active && <th className="px-4 py-2 text-left">Matching events</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, s, matches }) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/patient/${encodeURIComponent(p.id)}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      {p.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.reportCount}</td>
                  <td className="px-4 py-3 tabular-nums">{s.eventCount}</td>
                  <td className="px-4 py-3 tabular-nums">{s.crossChainCount}</td>
                  {active && <td className="px-4 py-3 tabular-nums">{matches}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
