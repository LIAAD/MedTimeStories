import { useMemo, useState } from "react";
import type { ClinEvent, IdentityRelation, TemporalRelation } from "../data/schema";
import GraphCanvas, { type GEdgeData, type GNodeData } from "./GraphCanvas";
import { graphEventKind, graphEventLabel, graphEventLane, graphEventTime } from "../lib/util";
import { EmptyState, Toggle } from "./ui";

interface Props {
  events: ClinEvent[];
  relations: TemporalRelation[];
  identityRelations: IdentityRelation[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Optional global ordering (e.g. report order, then text order) used instead of plain offsets when events come from several reports. */
  eventOrder?: Map<string, number>;
  /** Optional extra text appended to each node's sublabel (e.g. the report). */
  sublabelPrefix?: (e: ClinEvent) => string;
}

export default function TemporalGraph({ events, relations, identityRelations, selectedId, onSelect, onHover, eventOrder, sublabelPrefix }: Props) {
  const [hiddenRel, setHiddenRel] = useState<Set<string>>(new Set());
  const [showIsolated, setShowIsolated] = useState(false);
  const [showGeneralEvents, setShowGeneralEvents] = useState(false);
  const hideGeneralEvents = !showGeneralEvents;

  // General events stay in the layout (so anchoring is unchanged) and are only hidden when drawing.
  const visibleEvents = events;
  const hiddenIds = useMemo(
    () => new Set(hideGeneralEvents ? events.filter((e) => String(e.attributes?.inceptionLabel ?? "").toLowerCase() === "general event").map((e) => e.id) : []),
    [events, hideGeneralEvents],
  );
  const visible = useMemo(() => new Set(visibleEvents.map((e) => e.id)), [visibleEvents]);
  const inScope = useMemo(() => relations.filter((r) => visible.has(r.source) && visible.has(r.target)), [relations, visible]);
  const identityEdges = useMemo(
    () =>
      identityRelations.flatMap((chain) => {
        const mentions = [...new Set(chain.chain.filter((eventId) => visible.has(eventId)))];
        return mentions.slice(1).map((eventId, index): GEdgeData => ({
          id: `${chain.id}:${mentions[index]}:${eventId}`,
          source: mentions[index],
          target: eventId,
          type: "IDENTITY",
          directed: false,
        }));
      }),
    [identityRelations, visible],
  );
  const relCounts = useMemo(() => {
    const m = new Map<string, number>();
    inScope.forEach((r) => m.set(r.type, (m.get(r.type) ?? 0) + 1));
    if (identityEdges.length) m.set("IDENTITY", (m.get("IDENTITY") ?? 0) + identityEdges.length);
    return [...m.entries()].sort();
  }, [inScope, identityEdges]);
  const { nodes, edges, repOf } = useMemo(() => {
    // Date expressions linked by identity are the same time point: merge them into one node.
    const byId = new Map(visibleEvents.map((e) => [e.id, e]));
    const repOf = new Map<string, string>();
    for (const chain of identityRelations) {
      const dates = [...new Set(chain.chain)].filter((id) => byId.has(id) && graphEventTime(byId.get(id)!) !== undefined);
      if (dates.length < 2) continue;
      const rep = dates.map((id) => repOf.get(id) ?? id).sort((a, b) => byId.get(a)!.start - byId.get(b)!.start)[0];
      for (const id of dates) {
        const old = repOf.get(id) ?? id;
        for (const [k, v] of repOf) if (v === old) repOf.set(k, rep);
        repOf.set(id, rep);
      }
    }
    const rep = (id: string) => repOf.get(id) ?? id;
    const seen = new Set<string>();
    const edges: GEdgeData[] = [
      ...inScope.filter((r) => !hiddenRel.has(r.type)),
      ...identityEdges.filter((edge) => !hiddenRel.has(edge.type)),
    ]
      .map((e) => ({ ...e, source: rep(e.source), target: rep(e.target) }))
      .filter((e) => {
        if (e.type === "IDENTITY" && e.source === e.target) return false;
        const key = `${e.source}|${e.target}|${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
          temporalTime: graphEventTime(e),
          present: e.type.toUpperCase() === "TIME" && /^val=(?:past|future|present)_ref\s+anchor_value=\d{4}-\d{2}-\d{2}$/.test(String(e.attributes?.Value ?? "").trim()),
        };
      });
    return { nodes, edges, repOf };
  }, [visibleEvents, inScope, identityEdges, identityRelations, hiddenRel, showIsolated, eventOrder, sublabelPrefix]);

  const toggleRel = (t: string) =>
    setHiddenRel((cur) => {
      const n = new Set(cur);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Relations:</span>
        {relCounts.map(([t, c]) => (
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
        <EmptyState title="Nothing to draw" hint="No visible temporal or identity links in this report (check type filters)." />
      ) : (
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedIds={new Set(selectedId ? [repOf.get(selectedId) ?? selectedId] : [])}
          onSelect={onSelect}
          onHover={onHover}
          nestIncluded
          hiddenIds={hiddenIds}
        />
      )}
      <p className="text-xs text-slate-500">Left to right follows temporal start order. Simultaneous events share a column; colors identify event types.</p>
    </div>
  );
}
