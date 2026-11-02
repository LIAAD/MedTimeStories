import { useMemo, useState } from "react";
import { useLoaded } from "../data/DataContext";
import { typeStyle } from "../lib/colors";
import { buildWordGraph, packedLayout } from "../lib/wordGraph";
import { Card, EmptyState } from "../components/ui";

const W = 1500;

export default function WordGraph() {
  const { data } = useLoaded();
  const full = useMemo(() => buildWordGraph(data), [data]);
  const types = useMemo(() => [...new Set(full.nodes.map((n) => n.type))].sort(), [full]);
  const [minCount, setMinCount] = useState(1);
  const [maxNodes, setMaxNodes] = useState(40);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const { nodes, edges, layout } = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const edgesF = full.edges.filter((e) => e.count >= minCount);
    const degree = new Map<string, number>();
    edgesF.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) ?? 0) + e.count);
      degree.set(e.target, (degree.get(e.target) ?? 0) + e.count);
    });
    const byId = new Map(full.nodes.map((n) => [n.id, n]));
    const byDegree = (a: string, b: string) => degree.get(b)! - degree.get(a)!;
    const matched = [...degree.keys()]
      .filter((id) => {
        const n = byId.get(id)!;
        return (!type || n.type === type) && (!ql || n.label.includes(ql));
      })
      .sort(byDegree);
    const keep = new Set(matched.slice(0, maxNodes));
    if (ql || type) {
      // Matches are shown together with their neighbours so their connections stay visible.
      const nb = new Set<string>();
      edgesF.forEach((e) => {
        if (keep.has(e.source)) nb.add(e.target);
        if (keep.has(e.target)) nb.add(e.source);
      });
      [...nb].filter((id) => !keep.has(id)).sort(byDegree).slice(0, Math.max(0, maxNodes * 2 - keep.size)).forEach((id) => keep.add(id));
    }
    const nodesAll = [...keep].map((id) => byId.get(id)!);
    const edges = edgesF.filter(
      (e) => keep.has(e.source) && keep.has(e.target) && (!(ql || type) || matched.includes(e.source) || matched.includes(e.target)),
    );
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    const nodes = nodesAll.filter((n) => linked.has(n.id));
    return { nodes, edges, layout: packedLayout(nodes, edges, W) };
  }, [full, minCount, maxNodes, type, q]);
  const { pos, width: gw, height: gh } = layout;

  const maxEdge = Math.max(1, ...edges.map((e) => e.count));
  const maxNode = Math.max(1, ...nodes.map((n) => n.count));
  const radius = (n: { count: number }) => 5 + (n.count / maxNode) * 11;
  const focus = selected ?? hovered;
  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (focus) {
      s.add(focus);
      edges.forEach((e) => {
        if (e.source === focus) s.add(e.target);
        if (e.target === focus) s.add(e.source);
      });
    }
    return s;
  }, [focus, edges]);

  // Focus view: one row per connection. Words leading into the selection are on the left, words it leads to are on the right.
  // A word connected in both directions appears once on each side, so the two relations never overlap.
  const focusRows = useMemo(() => {
    if (!selected) return null;
    const rel = (e: (typeof full.edges)[number]) =>
      Object.entries(e.relations).sort((x, y) => y[1] - x[1]).map(([r, c]) => `${r}×${c}`).join(", ");
    const ins = full.edges.filter((e) => e.target === selected).sort((a, b) => b.count - a.count)
      .map((e) => ({ id: e.source, label: rel(e), count: e.count }));
    const outs = full.edges.filter((e) => e.source === selected).sort((a, b) => b.count - a.count)
      .map((e) => ({ id: e.target, label: rel(e), count: e.count }));
    return { ins, outs };
  }, [selected, full]);
  const viewBox = `0 0 ${gw} ${gh}`;
  // Labels are shown for the most frequent words, small clusters, and the focused neighbourhood.
  const labelled = useMemo(() => {
    const ids = new Set([...nodes].sort((a, b) => b.count - a.count).slice(0, 30).map((n) => n.id));
    const size = new Map<number, number>();
    nodes.forEach((n) => size.set(layout.component.get(n.id)!, (size.get(layout.component.get(n.id)!) ?? 0) + 1));
    nodes.forEach((n) => {
      if ((size.get(layout.component.get(n.id)!) ?? 0) <= 6) ids.add(n.id);
    });
    return ids;
  }, [nodes, layout]);
  const sel = full.nodes.find((n) => n.id === selected);
  const field = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Word graph</h1>
          <p className="text-sm text-slate-500">
            Actual words (lower-cased) as nodes, aggregated over all patients. Edge width = number of relations; click a word to focus it (words leading into it on the left, words it leads to on the right), click empty space to go back.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <input type="search" placeholder="Filter word…" value={q} onChange={(e) => setQ(e.target.value)} className={`${field} w-40`} />
          <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
            <option value="">All event types</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1.5">
            Min count {minCount}
            <input type="range" min={1} max={20} value={minCount} onChange={(e) => setMinCount(+e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5">
            Max words {maxNodes}
            <input type="range" min={10} max={150} step={5} value={maxNodes} onChange={(e) => setMaxNodes(+e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5">
            Zoom {Math.round(zoom * 100)}%
            <input type="range" min={0.6} max={2.5} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          </label>
        </div>
      </div>

      {nodes.length === 0 ? (
        <EmptyState title="No words match" hint="Lower the minimum count or clear the filters." />
      ) : (
        <Card className="max-h-[75vh] overflow-auto">
          {focusRows && selected ? (
            (() => {
              const GAP = 54, CX = 750, LX = 400, RX = 1100, PAD = 50;
              const rows = Math.max(focusRows.ins.length, focusRows.outs.length, 1);
              const H = rows * GAP + PAD * 2;
              const cy = H / 2;
              const centre = full.nodes.find((n) => n.id === selected)!;
              const yOf = (i: number, len: number) => cy + (i - (len - 1) / 2) * GAP;
              const Row = ({ item, i, len, side }: { item: { id: string; label: string }; i: number; len: number; side: "in" | "out" }) => {
                const n = full.nodes.find((x) => x.id === item.id)!;
                const x = side === "in" ? LX : RX;
                const y = yOf(i, len);
                const r = radius(n) + 2;
                const rc = radius(centre) + 4;
                const [x1, y1, x2, y2] = side === "in" ? [x + r, y, CX - rc, cy] : [CX + rc, cy, x - r, y];
                const t = side === "in" ? 0.3 : 0.7;
                const mx = x1 + (x2 - x1) * t, my = y1 + (y2 - y1) * t;
                const w = item.label.length * 6.4 + 14;
                const s = typeStyle(n.type);
                return (
                  <g>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366f1" strokeWidth={1.5} markerEnd="url(#w-arrow-hi)" />
                    <rect x={mx - w / 2} y={my - 10} width={w} height={20} rx={10} className="fill-white stroke-indigo-300 dark:fill-slate-900 dark:stroke-indigo-700" />
                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={12} className="fill-indigo-700 dark:fill-indigo-300">{item.label}</text>
                    <g className="cursor-pointer" transform={`translate(${x},${y})`} onClick={(ev) => { ev.stopPropagation(); setSelected(n.id); }}>
                      <title>{`${n.label} (${n.type}) — ${n.count} mention(s), ${n.patientCount} patient(s)`}</title>
                      <circle r={r} fill={s.hex} fillOpacity={0.55} stroke={s.hex} strokeWidth={1.5} />
                      <text x={side === "in" ? -(r + 8) : r + 8} textAnchor={side === "in" ? "end" : "start"} dominantBaseline="central" fontSize={14} strokeWidth={4} className="fill-slate-900 stroke-white [paint-order:stroke] dark:fill-slate-100 dark:stroke-slate-900">
                        {n.label.length > 36 ? `${n.label.slice(0, 35)}…` : n.label}
                      </text>
                    </g>
                  </g>
                );
              };
              return (
                <svg viewBox={`0 0 1500 ${H}`} style={{ width: `${zoom * 100}%` }} className="block h-auto" onClick={() => setSelected(null)}>
                  <defs>
                    <marker id="w-arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="#6366f1" />
                    </marker>
                  </defs>
                  <text x={LX} y={20} textAnchor="middle" fontSize={11} className="fill-slate-500 font-semibold uppercase">leads to this word</text>
                  <text x={RX} y={20} textAnchor="middle" fontSize={11} className="fill-slate-500 font-semibold uppercase">this word leads to</text>
                  {focusRows.ins.map((it, i) => <Row key={`i${it.id}`} item={it} i={i} len={focusRows.ins.length} side="in" />)}
                  {focusRows.outs.map((it, i) => <Row key={`o${it.id}`} item={it} i={i} len={focusRows.outs.length} side="out" />)}
                  <g transform={`translate(${CX},${cy})`}>
                    <title>{`${centre.label} (${centre.type})`}</title>
                    <circle r={radius(centre) + 4} fill={typeStyle(centre.type).hex} fillOpacity={0.6} stroke="#4f46e5" strokeWidth={3} />
                    <text y={radius(centre) + 22} textAnchor="middle" fontSize={16} fontWeight={700} strokeWidth={4} className="fill-slate-900 stroke-white [paint-order:stroke] dark:fill-slate-100 dark:stroke-slate-900">{centre.label}</text>
                  </g>
                </svg>
              );
            })()
          ) : (
          <svg viewBox={viewBox} style={{ width: `${zoom * 100}%` }} className="block h-auto" onClick={() => setSelected(null)}>
            <defs>
              <marker id="w-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
              </marker>
              <marker id="w-arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#6366f1" />
              </marker>
            </defs>
            {edges.map((e) => {
              const a = pos.get(e.source)!;
              const b = pos.get(e.target)!;
              const hi = !!focus && (e.source === focus || e.target === focus);
              const dim = !!focus && !hi;
              const rel = Object.entries(e.relations).sort((x, y) => y[1] - x[1]).map(([r, c]) => `${r}×${c}`).join(", ");
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len;
              // Offset sideways so A→B and B→A don't overlap; trim so arrows end at the node edge.
              const ox = -uy * 4, oy = ux * 4;
              const ra = radius(full.nodes.find((n) => n.id === e.source)!) + 2;
              const rb = radius(full.nodes.find((n) => n.id === e.target)!) + 3;
              const x1 = a.x + ox + ux * ra, y1 = a.y + oy + uy * ra, x2 = b.x + ox - ux * rb, y2 = b.y + oy - uy * rb;
              return (
                <g key={e.id} opacity={dim ? 0.05 : 1}>
                  <title>{rel}</title>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hi ? "#6366f1" : "#94a3b8"} strokeWidth={hi ? 1.5 + (e.count / maxEdge) * 3 : 0.8 + (e.count / maxEdge) * 2.2} strokeOpacity={hi ? 0.95 : 0.45} markerEnd={`url(#${hi ? "w-arrow-hi" : "w-arrow"})`} />
                  {hi && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={10} strokeWidth={4} className="fill-indigo-700 stroke-white [paint-order:stroke] dark:fill-indigo-300 dark:stroke-slate-900">
                      {rel}
                    </text>
                  )}
                </g>
              );
            })}
            {[...nodes].sort((a, b) => (neighbors.has(a.id) ? 1 : 0) - (neighbors.has(b.id) ? 1 : 0)).map((n) => {
              const p = pos.get(n.id)!;
              const s = typeStyle(n.type);
              const dim = !!focus && !neighbors.has(n.id);
              const r = radius(n);
              const showLabel = focus ? neighbors.has(n.id) : labelled.has(n.id);
              const label = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dim ? 0.12 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelected(n.id === selected ? null : n.id);
                  }}
                >
                  <title>{`${n.label} (${n.type}) — ${n.count} mention(s), ${n.patientCount} patient(s)`}</title>
                  <circle r={r} fill={s.hex} fillOpacity={0.55} stroke={n.id === selected ? "#4f46e5" : s.hex} strokeWidth={n.id === selected ? 3 : 1.5} />
                  {showLabel && (
                    <text
                      y={r + 14}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={focus && neighbors.has(n.id) ? 600 : 400}
                      strokeWidth={4}
                      className="pointer-events-none fill-slate-900 stroke-white [paint-order:stroke] dark:fill-slate-100 dark:stroke-slate-900"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {types.filter((t) => nodes.some((n) => n.type === t)).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${typeStyle(t).dot}`} />{t}
          </span>
        ))}
        <span className="ml-auto">{nodes.length} words, {edges.length} connections shown</span>
      </div>
      {sel && (
        <Card className="p-4 text-sm">
          <p className="font-semibold">{sel.label} <span className="font-normal text-slate-500">({sel.type} · {sel.count} mentions · {sel.patientCount} patients)</span></p>
          <ul className="mt-2 space-y-0.5">
            {full.edges
              .filter((e) => e.source === sel.id || e.target === sel.id)
              .sort((a, b) => b.count - a.count)
              .map((e) => {
                const out = e.source === sel.id;
                const other = full.nodes.find((n) => n.id === (out ? e.target : e.source))!;
                const rel = Object.entries(e.relations).map(([r, c]) => `${r}×${c}`).join(", ");
                return <li key={e.id}>{out ? "→" : "←"} <span className="font-mono text-xs">{rel}</span> {other.label}</li>;
              })}
          </ul>
        </Card>
      )}
    </div>
  );
}
