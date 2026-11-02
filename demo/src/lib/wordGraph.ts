import type { Dataset } from "../data/schema";
import { graphEventKind } from "./util";

export interface WordNode {
  id: string;
  label: string;
  type: string;
  count: number;
  patientCount: number;
}
export interface WordEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  relations: Record<string, number>;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Aggregates relations over all patients into a graph whose nodes are the actual (normalised) surface words. */
export function buildWordGraph(data: Dataset): { nodes: WordNode[]; edges: WordEdge[] } {
  const nodes = new Map<string, WordNode & { patients: Set<string> }>();
  const edges = new Map<string, WordEdge>();

  for (const p of data.patients) {
    const keyOf = new Map<string, string>();
    for (const r of p.reports) {
      for (const e of r.events) {
        const type = graphEventKind(e).type;
        const label = norm(e.surface);
        const id = `${type}\u0000${label}`;
        keyOf.set(e.id, id);
        let n = nodes.get(id);
        if (!n) {
          n = { id, label, type, count: 0, patientCount: 0, patients: new Set() };
          nodes.set(id, n);
        }
        n.count++;
        n.patients.add(p.id);
      }
    }
    for (const r of p.reports) {
      for (const t of r.temporalRelations) {
        const s = keyOf.get(t.source);
        const d = keyOf.get(t.target);
        if (!s || !d || s === d) continue;
        const id = `${s}\u0001${d}`;
        let e = edges.get(id);
        if (!e) {
          e = { id, source: s, target: d, count: 0, relations: {} };
          edges.set(id, e);
        }
        e.count++;
        e.relations[t.type] = (e.relations[t.type] ?? 0) + 1;
      }
    }
  }

  return {
    nodes: [...nodes.values()].map(({ patients, ...n }) => ({ ...n, patientCount: patients.size })),
    edges: [...edges.values()],
  };
}

/** Small deterministic force-directed layout. */
export function forceLayout(
  nodes: { id: string }[],
  edges: { source: string; target: string; count: number }[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, n);
    return { x: width / 2 + Math.cos(a) * width * 0.35, y: height / 2 + Math.sin(a) * height * 0.35, vx: 0, vy: 0 };
  });
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target), e.count] as const)
    .filter((l): l is readonly [number, number, number] => l[0] !== undefined && l[1] !== undefined);
  const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.8;

  for (let it = 0; it < 300; it++) {
    const cool = 1 - it / 300;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (i % 2 ? 1 : -1) * 0.1;
          dy = 0.1;
          d2 = 0.02;
        }
        const d = Math.sqrt(d2);
        const f = (k * k) / d2;
        pos[i].vx += (dx / d) * f; pos[i].vy += (dy / d) * f;
        pos[j].vx -= (dx / d) * f; pos[j].vy -= (dy / d) * f;
      }
    }
    for (const [a, b, c] of links) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d * d) / k) * (1 + Math.log(c)) * 0.3;
      pos[a].vx += (dx / d) * f; pos[a].vy += (dy / d) * f;
      pos[b].vx -= (dx / d) * f; pos[b].vy -= (dy / d) * f;
    }
    for (const p of pos) {
      p.vx += (width / 2 - p.x) * 0.02;
      p.vy += (height / 2 - p.y) * 0.02;
      const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const step = Math.min(len, 40 * cool + 1);
      p.x = Math.min(width - 60, Math.max(60, p.x + (p.vx / len) * step));
      p.y = Math.min(height - 25, Math.max(25, p.y + (p.vy / len) * step));
      p.vx = 0;
      p.vy = 0;
    }
    // Collision pass keeps nodes (and their labels) from sitting on top of each other.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = 70;
        if (d < min) {
          const push = (min - d) / 2;
          pos[i].x += (dx / d) * push; pos[i].y += (dy / d) * push;
          pos[j].x -= (dx / d) * push; pos[j].y -= (dy / d) * push;
        }
      }
    }
  }
  return new Map(nodes.map((nd, i) => [nd.id, { x: pos[i].x, y: pos[i].y }]));
}

/** Lays out each connected component on its own and packs the components into rows. */
export function packedLayout(
  nodes: { id: string }[],
  edges: { source: string; target: string; count: number }[],
  maxWidth: number,
): { pos: Map<string, { x: number; y: number }>; width: number; height: number; component: Map<string, number> } {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  edges.forEach((e) => {
    if (parent.has(e.source) && parent.has(e.target)) parent.set(find(e.source), find(e.target));
  });
  const groups = new Map<string, { id: string }[]>();
  nodes.forEach((n) => {
    const r = find(n.id);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  });
  const comps = [...groups.values()].sort((a, b) => b.length - a.length);

  const pos = new Map<string, { x: number; y: number }>();
  const component = new Map<string, number>();
  let x = 0, y = 0, rowH = 0, width = 0;
  const gap = 24;
  // Singletons go into a compact grid at the end instead of taking a whole cluster box each.
  const singles = comps.filter((c) => c.length === 1).map((c) => c[0]);
  const multi = comps.filter((c) => c.length > 1);
  const bigCount = multi.filter((c) => c.length >= 8).length;
  multi.forEach((c, ci) => {
    const ids = new Set(c.map((n) => n.id));
    const big = c.length >= 8;
    let h = Math.max(130, 120 + 85 * Math.sqrt(c.length));
    // Large clusters use the full width so they spread out instead of hugging a corner.
    let w = big && bigCount === 1 ? maxWidth : Math.min(maxWidth, Math.max(360, h * 1.5));
    if (big && bigCount === 1) h = Math.max(h, Math.min(700, 90 * Math.sqrt(c.length)));
    if (x > 0 && x + w > maxWidth) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    const local = forceLayout(c, edges.filter((e) => ids.has(e.source) && ids.has(e.target)), w, h);
    local.forEach((p, id) => {
      pos.set(id, { x: p.x + x, y: p.y + y });
      component.set(id, ci);
    });
    x += w + gap;
    rowH = Math.max(rowH, h);
    width = Math.max(width, x - gap);
  });
  if (singles.length) {
    if (x > 0) { y += rowH + gap; x = 0; rowH = 0; }
    const cellW = 150, cellH = 56;
    const cols = Math.max(1, Math.floor(maxWidth / cellW));
    singles.forEach((n, i) => {
      pos.set(n.id, { x: (i % cols) * cellW + cellW / 2, y: y + Math.floor(i / cols) * cellH + 30 });
      component.set(n.id, multi.length + i);
    });
    rowH = Math.ceil(singles.length / cols) * cellH + 20;
    width = Math.max(width, Math.min(singles.length, cols) * cellW);
  }
  return { pos, width: Math.max(width, 300), height: y + rowH, component };
}
