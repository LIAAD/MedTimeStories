import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Patient } from "../data/schema";
import { useLoaded } from "../data/DataContext";
import { eventUrl, reportLabel } from "../lib/util";
import TemporalGraph from "./TemporalGraph";
import { Card, EmptyState } from "./ui";

/** Same graph (and layout rules) as a single report, fed with the events and relations of every report of the patient. */
export default function PatientTimeline({ patient }: { patient: Patient }) {
  const { idx } = useLoaded();
  const [selected, setSelected] = useState<string | null>(null);

  const { events, relations, eventOrder } = useMemo(() => {
    const reports = [...patient.reports].sort((a, b) => (idx.reportIndex.get(a.id) ?? 0) - (idx.reportIndex.get(b.id) ?? 0));
    const events = reports.flatMap((r) => [...r.events].sort((a, b) => a.start - b.start));
    return {
      events,
      relations: reports.flatMap((r) => r.temporalRelations),
      eventOrder: new Map(events.map((e, i) => [e.id, i] as const)),
    };
  }, [idx, patient]);

  const sublabelPrefix = useCallback((e: { reportId: string }) => reportLabel(idx, e.reportId), [idx]);
  const chain = selected ? patient.identityRelations.find((c) => c.chain.includes(selected)) : undefined;
  const mentions = selected ? (chain ? chain.chain : [selected]) : [];

  if (relations.length === 0) return <EmptyState title="No temporal relations for this patient" />;

  return (
    <div className="space-y-3">
      <TemporalGraph
        events={events}
        relations={relations}
        identityRelations={patient.identityRelations}
        selectedId={selected}
        onSelect={setSelected}
        onHover={() => {}}
        eventOrder={eventOrder}
        sublabelPrefix={sublabelPrefix}
      />
      {selected && (
        <Card className="p-3">
          <h3 className="mb-2 font-semibold">Mentions</h3>
          <div className="flex flex-wrap gap-1.5">
            {mentions.map((m) => {
              const e = idx.events.get(m);
              if (!e) return null;
              return (
                <Link
                  key={m}
                  to={eventUrl(idx, m)}
                  className="rounded-full border border-slate-300 px-2.5 py-0.5 text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:hover:bg-indigo-500/20"
                >
                  {e.surface} <span className="text-xs text-slate-400">{reportLabel(idx, e.reportId)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
