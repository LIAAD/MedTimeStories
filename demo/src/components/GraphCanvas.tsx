import { useMemo, useRef, useState } from "react";
import { layoutGraph, NODE_H, NODE_W } from "../lib/graphLayout";
import { typeStyle } from "../lib/colors";
import { truncate, type DateMarker } from "../lib/util";

const MARKER_STYLE: Record<DateMarker, { fill: string; label: string }> = {
  admission: { fill: "#2563eb", label: "Admission" },
  discharge: { fill: "#dc2626", label: "Discharge" },
};

export interface GNodeData {
  id: string;
  label: string;
  sublabel?: string;
  type: string;
  lane?: string;
  hint?: number;
  temporalTime?: number;
  present?: boolean;
  markers?: DateMarker[];
}
export interface GEdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  layoutType?: string;
  directed?: boolean;
}

interface Props {
  nodes: GNodeData[];
  edges: GEdgeData[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  nestIncluded?: boolean;
  /** Nodes kept in the layout (so positions don't change) but not drawn, along with their edges. */
  hiddenIds?: Set<string>;
}

export default function GraphCanvas({ nodes, edges, selectedIds, onSelect, onHover, nestIncluded, hiddenIds }: Props) {
  const layout = useMemo(
    () => layoutGraph(nodes.map((n) => ({ id: n.id, lane: n.lane ?? "Events", hint: n.hint, temporalTime: n.temporalTime, present: n.present })),     edges.map((e) => ({ ...e, type: e.layoutType ?? e.type })), nestIncluded, hiddenIds),
        [nodes, edges, nestIncluded, hiddenIds],
  );
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));
  const anySel = selectedIds.size > 0;
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const clamp = (z: number) => Math.min(3, Math.max(0.2, Math.round(z * 100) / 100));
  const fit = () => {
    const w = box.current?.clientWidth;
    if (w) setZoom(clamp((w - 2) / layout.width));
  };

  return (
    <div className="flex items-start gap-2">
      <div ref={box} className="max-h-[70vh] min-w-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} className="block">
        <defs>
          <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
          </marker>
          <marker id="g-arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#6366f1" />
          </marker>
          <marker id="g-time-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-lime-600" />
          </marker>
        </defs>
        {layout.lanes.map((l, i) => (
          <g key={l.name}>
            <rect x={0} y={l.y} width={layout.width} height={l.h} className={i % 2 ? "fill-slate-50 dark:fill-slate-900" : "fill-white dark:fill-slate-950/40"} />
            <text x={10} y={l.y + l.h / 2} dominantBaseline="middle" fontSize="11" className="fill-slate-500 font-semibold uppercase">
              {l.name}
            </text>
          </g>
        ))}
        {layout.lanes.filter((l) => l.name.toUpperCase() === "DATES").map((l) => {
          const ay = l.y + l.h - 10;
          const dates = nodes.filter((n) => (n.lane ?? "").toUpperCase() === "DATES" && !hiddenIds?.has(n.id) && layout.pos.has(n.id));
          return (
            <g key="time-axis" className="pointer-events-none">
              <line x1={8} y1={ay} x2={layout.width - 8} y2={ay} strokeWidth={2.5} className="stroke-lime-600 dark:stroke-lime-500" markerEnd="url(#g-time-arrow)" />
              <text x={10} y={ay - 6} fontSize="10" className="fill-lime-700 font-semibold uppercase dark:fill-lime-400">time →</text>
              {dates.map((n) => {
                const p = layout.pos.get(n.id)!;
                const { w, h } = layout.size.get(n.id) ?? { w: NODE_W, h: NODE_H };
                return (
                  <g key={n.id}>
                    <line x1={p.x + w / 2} y1={p.y + h} x2={p.x + w / 2} y2={ay} strokeWidth={1.5} className="stroke-lime-600 dark:stroke-lime-500" />
                    <circle cx={p.x + w / 2} cy={ay} r={4} className="fill-lime-600 dark:fill-lime-500" />
                  </g>
                );
              })}
            </g>
          );
        })}
        {layout.zones.map((z) => (
          <g key={z.name}>
            <rect x={z.x} y={0} width={z.w} height={layout.height} className={`${z.name === "Present" ? "fill-transparent" : "fill-indigo-500/5"} stroke-indigo-300 dark:stroke-indigo-700`} strokeDasharray="4 3" />
            <text x={z.x + z.w / 2} y={12} textAnchor="middle" fontSize="10" className="fill-indigo-600 font-semibold uppercase dark:fill-indigo-300">
              {z.name}
            </text>
          </g>
        ))}
        {edges.map((e) => {
          const le = edgeById.get(e.id);
          if (!le || layout.hiddenEdges.has(e.id) || hiddenIds?.has(e.source) || hiddenIds?.has(e.target)) return null;
          const hi = selectedIds.has(e.source) || selectedIds.has(e.target);
          return (
            <g key={e.id} opacity={anySel && !hi ? 0.3 : 1}>
              <path
                d={le.d}
                fill="none"
                stroke={hi ? "#6366f1" : "#94a3b8"}
                strokeWidth={hi ? 2 : 1.3}
                strokeDasharray={e.directed === false ? "5 4" : undefined}
                markerEnd={e.directed === false ? undefined : `url(#${hi ? "g-arrow-hi" : "g-arrow"})`}
              />
              <text
                x={le.lx}
                y={le.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                strokeWidth={3}
                className="fill-slate-600 stroke-white [paint-order:stroke] dark:fill-slate-300 dark:stroke-slate-900"
              >
                {e.type}
              </text>
            </g>
          );
        })}
        {[...nodes].sort((a, b) => layout.depth(a.id) - layout.depth(b.id)).map((n) => {
          const p = layout.pos.get(n.id);
          if (!p || hiddenIds?.has(n.id)) return null;
          const s = typeStyle(n.type);
          const sel = selectedIds.has(n.id);
          const { w, h } = layout.size.get(n.id) ?? { w: NODE_W, h: NODE_H };
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(n.id);
              }}
              onMouseEnter={() => onHover?.(n.id)}
              onMouseLeave={() => onHover?.(null)}
              className="cursor-pointer"
            >
              <title>{[n.label, ...(n.markers ?? []).map((m) => MARKER_STYLE[m].label)].join(" · ")}</title>
              <rect width={w} height={h} rx={8} fill={s.hex} fillOpacity={0.2} stroke={sel ? "#6366f1" : s.hex} strokeWidth={sel ? 3 : 1.5} />
              <text x={w / 2} y={18} textAnchor="middle" fontSize="12" fontWeight={600} className="fill-slate-900 dark:fill-slate-100">
                {truncate(n.label, 20)}
              </text>
              <text x={w / 2} y={34} textAnchor="middle" fontSize="10" className="fill-slate-600 dark:fill-slate-400">
                {truncate(n.sublabel ?? n.type.toLowerCase(), 27)}
              </text>
              {(n.markers ?? []).map((m, i) => (
                <circle key={m} cx={w - 9 - i * 14} cy={9} r={5} fill={MARKER_STYLE[m].fill} className="stroke-white dark:stroke-slate-900" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
      </svg>
      </div>
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-800 dark:bg-slate-900">
        <button type="button" title="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.1))} className="h-8 w-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800">+</button>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(clamp(Number(e.target.value)))}
          aria-label="Zoom"
          className="h-28 w-6 cursor-pointer"
          style={{ writingMode: "vertical-lr", direction: "rtl" }}
        />
        <button type="button" title="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.1))} className="h-8 w-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800">−</button>
        <span className="text-[10px] text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" title="Fit to width" onClick={fit} className="h-7 w-9 rounded text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800">Fit</button>
        <button type="button" title="Reset zoom" onClick={() => setZoom(1)} className="h-7 w-9 rounded text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800">1:1</button>
      </div>
    </div>
  );
}
