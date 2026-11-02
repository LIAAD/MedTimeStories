import { useCallback, useMemo, useState } from "react";
import type { Patient } from "../data/schema";
import { useLoaded } from "../data/DataContext";
import { reportLabel } from "../lib/util";
import TemporalGraph from "./TemporalGraph";
import { EmptyState } from "./ui";

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

  if (relations.length === 0) return <EmptyState title="No relations for this patient" />;

  return (
    <div className="space-y-3">
      <TemporalGraph
        events={events}
        relations={relations}
        selectedId={selected}
        onSelect={setSelected}
        onHover={() => {}}
        eventOrder={eventOrder}
        sublabelPrefix={sublabelPrefix}
      />
    </div>
  );
}
