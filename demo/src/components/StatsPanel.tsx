import { useMemo } from "react";
import type { ClinEvent, TemporalRelation } from "../data/schema";
import { typeStyle } from "../lib/colors";
import { Card } from "./ui";

function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Bars({ title, rows, color }: { title: string; rows: [string, number][]; color: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      {rows.length === 0 && <p className="text-sm text-slate-500">None.</p>}
      <ul className="space-y-1.5">
        {rows.map(([k, v]) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between">
              <span>{k}</span>
              <span className="tabular-nums text-slate-500">{v}</span>
            </div>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
              <div className={`h-2 rounded ${color(k)}`} style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StatsPanel({ events, relations }: { events: ClinEvent[]; relations: TemporalRelation[] }) {
  const ev = useMemo(() => count(events, (e) => e.type), [events]);
  const rel = useMemo(() => count(relations, (r) => r.type), [relations]);
  return (
    <Card className="space-y-5 p-4">
      <Bars title="Event types" rows={ev} color={(k) => typeStyle(k).dot} />
      <Bars title="Relation types" rows={rel} color={() => "bg-indigo-500"} />
    </Card>
  );
}
