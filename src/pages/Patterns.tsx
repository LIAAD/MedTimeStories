import { useMemo, useState } from "react";
import { useLoaded } from "../data/DataContext";
import { typeStyle } from "../lib/colors";
import { aggregateConnections } from "../lib/patterns";
import { Card, EmptyState } from "../components/ui";

type View = "list" | "matrix";

export default function Patterns() {
  const { data } = useLoaded();
  const summary = useMemo(() => aggregateConnections(data), [data]);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [rel, setRel] = useState("");
  const [view, setView] = useState<View>("list");

  const rows = useMemo(
    () =>
      summary.patterns.filter(
        (p) => (!source || p.sourceType === source) && (!target || p.targetType === target) && (!rel || p.relationType === rel),
      ),
    [summary, source, target, rel],
  );
  const max = Math.max(1, ...rows.map((r) => r.count));
  const field = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  const matrix = useMemo(() => {
    const cells = new Map<string, number>();
    rows.forEach((r) => cells.set(`${r.sourceType}\u0000${r.targetType}`, (cells.get(`${r.sourceType}\u0000${r.targetType}`) ?? 0) + r.count));
    const srcs = [...new Set(rows.map((r) => r.sourceType))].sort();
    const tgts = [...new Set(rows.map((r) => r.targetType))].sort();
    return { cells, srcs, tgts, max: Math.max(1, ...cells.values()) };
  }, [rows]);

  const typeSelect = (label: string, value: string, set: (v: string) => void) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className={field}>
      <option value="">{label}</option>
      {summary.eventTypes.map((t) => <option key={t}>{t}</option>)}
    </select>
  );

  const TypeLabel = ({ t }: { t: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${typeStyle(t).dot}`} />
      {t}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Connection patterns</h1>
          <p className="text-sm text-slate-500">
            Aggregated over {data.patients.length} patient(s): {summary.totalRelations} relation(s), {summary.patterns.length} distinct pattern(s).
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {typeSelect("Any source type", source, setSource)}
          {typeSelect("Any target type", target, setTarget)}
          <select aria-label="Relation type" value={rel} onChange={(e) => setRel(e.target.value)} className={field}>
            <option value="">Any relation</option>
            {summary.relationTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)} className={field}>
            <option value="list">List</option>
            <option value="matrix">Matrix</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No connections match" hint="Relax the filters." />
      ) : view === "list" ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Relation</th>
                <th className="px-4 py-2 text-left">Target</th>
                <th className="px-4 py-2 text-left">Count</th>
                <th className="px-4 py-2 text-left">Patients</th>
                <th className="px-4 py-2 text-left">Cross-report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.sourceType}|${r.relationType}|${r.targetType}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-2"><TypeLabel t={r.sourceType} /></td>
                  <td className="px-4 py-2 font-mono text-xs">{r.relationType} →</td>
                  <td className="px-4 py-2"><TypeLabel t={r.targetType} /></td>
                  <td className="w-56 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-10 tabular-nums">{r.count}</span>
                      <div className="h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded bg-indigo-500" style={{ width: `${(r.count / max) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{r.patientCount}</td>
                  <td className="px-4 py-2 tabular-nums">{r.crossReportCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="p-1 text-left text-xs text-slate-500">source ↓ / target →</th>
                {matrix.tgts.map((t) => <th key={t} className="p-1 text-left text-xs font-medium">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.srcs.map((s) => (
                <tr key={s}>
                  <th className="whitespace-nowrap p-1 text-left text-xs font-medium">{s}</th>
                  {matrix.tgts.map((t) => {
                    const v = matrix.cells.get(`${s}\u0000${t}`) ?? 0;
                    return (
                      <td
                        key={t}
                        title={`${s} → ${t}: ${v}`}
                        className="min-w-12 p-2 text-center tabular-nums"
                        style={{ backgroundColor: v ? `rgba(99,102,241,${0.12 + 0.78 * (v / matrix.max)})` : undefined }}
                      >
                        {v || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
