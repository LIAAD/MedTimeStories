import { useMemo, useState } from "react";
import type { ClinEvent, TemporalRelation } from "../data/schema";
import GraphCanvas, { type GEdgeData, type GNodeData } from "./GraphCanvas";
import { dateMarker, graphEventKind, graphEventLabel, graphEventLane, graphEventTime, type DateMarker } from "../lib/util";
import { EmptyState, Toggle } from "./ui";

interface Props {
  events: ClinEvent[];
  relations: TemporalRelation[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Optional global ordering (e.g. report order, then text order) used instead of plain offsets when events come from several reports. */
  eventOrder?: Map<string, number>;
  /** Optional extra text appended to each node's sublabel (e.g. the report). */
  sublabelPrefix?: (e: ClinEvent) => string;
}

export default function TemporalGraph({ events, relations, selectedId, onSelect, onHover, eventOrder, sublabelPrefix }: Props) {
  const [hiddenRel, setHiddenRel] = useState<Set<string>>(new Set());
  const [showIsolated, setShowIsolated] = useState(false);
  const [showRelations, setShowRelations] = useState(false);
  const [showGeneralEvents, setShowGeneralEvents] = useState(false);
  const hideGeneralEvents = !showGeneralEvents;

  // General events stay in the layout (so anchoring is unchanged) and are only hidden when drawing.
  const visibleEvents = events;
  const hiddenIds = useMemo(
    () => new Set(hideGeneralEvents ? events.filter((e) => e.type.toLowerCase() === "general event").map((e) => e.id) : []),
    [events, hideGeneralEvents],
  );
  const visible = useMemo(() => new Set(visibleEvents.map((e) => e.id)), [visibleEvents]);
  const inScope = useMemo(() => relations.filter((r) => visible.has(r.source) && visible.has(r.target)), [relations, visible]);
  const relCounts = useMemo(() => {
    const m = new Map<string, number>();
    inScope.forEach((r) => m.set(r.type, (m.get(r.type) ?? 0) + 1));
    return [...m.entries()].sort();
  }, [inScope]);
  const { nodes, edges, repOf } = useMemo(() => {
    // Date expressions linked by an identity relation, or with exactly the same date, are the same time point: merge them into one node.
    const byId = new Map(visibleEvents.map((e) => [e.id, e]));
    const repOf = new Map<string, string>();
    const order = (id: string) => (eventOrder ? (eventOrder.get(id) ?? 0) : byId.get(id)!.start);
    const mergeDates = (dates: string[]) => {
      if (dates.length < 2) return;
      const rep = dates.map((id) => repOf.get(id) ?? id).sort((a, b) => order(a) - order(b))[0];
      for (const id of dates) {
        const old = repOf.get(id) ?? id;
        for (const [k, v] of repOf) if (v === old) repOf.set(k, rep);
        repOf.set(id, rep);
      }
    };
    for (const r of inScope) {
      if (r.type === "IDENTITY" && [r.source, r.target].every((id) => graphEventTime(byId.get(id)!) !== undefined)) mergeDates([r.source, r.target]);
    }
    const byTime = new Map<number, string[]>();
    for (const e of visibleEvents) {
      const t = graphEventTime(e);
      if (t !== undefined) byTime.set(t, [...(byTime.get(t) ?? []), e.id]);
    }
    byTime.forEach(mergeDates);
    const rep = (id: string) => repOf.get(id) ?? id;
    const seen = new Set<string>();
    const edges: GEdgeData[] = inScope
      .filter((r) => !hiddenRel.has(r.type))
      .map((r): GEdgeData => ({ ...r, source: rep(r.source), target: rep(r.target), directed: r.type !== "IDENTITY" }))
      .filter((e) => {
        if (e.type === "IDENTITY" && e.source === e.target) return false;
        const key = `${e.source}|${e.target}|${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const markersOf = new Map<string, Set<DateMarker>>();
    for (const e of visibleEvents) {
      const m = dateMarker(e);
      if (!m) continue;
      const r = rep(e.id);
      markersOf.set(r, (markersOf.get(r) ?? new Set()).add(m));
    }
    const used = new Set(edges.flatMap((e) => [e.source, e.target]));
    const nodes: GNodeData[] = visibleEvents
      .filter((e) => rep(e.id) === e.id)
      .filter((e) => showIsolated || used.has(e.id))
      .sort((a, b) => (eventOrder ? (eventOrder.get(a.id) ?? 0) - (eventOrder.get(b.id) ?? 0) : a.start - b.start))
      .map((e, index) => {
        const kind = graphEventKind(e);
        return {
          id: e.id,
          label: graphEventLabel(e),
          type: kind.type,
          lane: graphEventLane(e),
          sublabel: sublabelPrefix ? `${sublabelPrefix(e)} · ${kind.sublabel}` : kind.sublabel,
          hint: index,
          markers: [...(markersOf.get(e.id) ?? [])],
          temporalTime: graphEventTime(e),
          present: e.type.toUpperCase() === "TIME" && /^val=(?:past|future|present)_ref\s+anchor_value=\d{4}-\d{2}-\d{2}$/.test(String(e.attributes?.Value ?? "").trim()),
        };
      });
    return { nodes, edges, repOf };
  }, [visibleEvents, inScope, hiddenRel, showIsolated, eventOrder, sublabelPrefix]);


  const toggleRel = (t: string) =>
    setHiddenRel((cur) => {
      const n = new Set(cur);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle checked={showRelations} onChange={setShowRelations} label="Show relations" />
        {showRelations && <span className="text-sm text-slate-500">Relations:</span>}
        {showRelations && relCounts.map(([t, c]) => (
          <button
            key={t}
            onClick={() => toggleRel(t)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              hiddenRel.has(t)
                ? "border-slate-300 text-slate-400 line-through dark:border-slate-700"
                : "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
            }`}
          >
            {t} ({c})
          </button>
        ))}
        <span className="ml-auto flex items-center gap-4">
          <Toggle checked={showGeneralEvents} onChange={setShowGeneralEvents} label="Show general events" />
          <Toggle checked={showIsolated} onChange={setShowIsolated} label="Show unconnected events" />
        </span>
      </div>
      {nodes.length === 0 ? (
        <EmptyState title="Nothing to draw" hint="No visible relations in this report (check type filters)." />
      ) : (
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedIds={new Set(selectedId ? [repOf.get(selectedId) ?? selectedId] : [])}
          onSelect={onSelect}
          onHover={onHover}
          nestIncluded
          hiddenIds={hiddenIds}
          showEdges={showRelations}
        />
      )}
      <p className="text-xs text-slate-500">Left to right follows temporal start order. Simultaneous events share a column; colors identify event types. <span className="inline-block h-2 w-2 rounded-full bg-blue-600" /> admission date, <span className="inline-block h-2 w-2 rounded-full bg-red-600" /> discharge date.</p>
    </div>
  );
}
