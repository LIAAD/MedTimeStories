import { TYPE_ORDER } from "./colors";

export interface LNode {
  id: string;
  lane: string;
  /** Optional minimum-rank hint (e.g. chronological report index) for otherwise unordered components. */
  hint?: number;
  temporalTime?: number;
  /** Offset-free relative time ("recentemente"): its column and the ones up to the date form the Present zone. */
  present?: boolean;
}
export interface LEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}
export interface Pos {
  x: number;
  y: number;
}
export interface LayoutResult {
  pos: Map<string, Pos>;
  edges: { id: string; d: string; lx: number; ly: number }[];
  lanes: { name: string; y: number; h: number }[];
  zones: { name: string; x: number; w: number }[];
  width: number;
  height: number;
  size: Map<string, { w: number; h: number }>;
  depth: (id: string) => number;
  hiddenEdges: Set<string>;
}

export const NODE_W = 150;
export const NODE_H = 44;
const NEST_PAD = 10;
const NEST_GAP = 8;
const COL_GAP = 70;
const ROW_GAP = 12;
const LANE_PAD = 14;
export const LEFT = 96;
const TOP = 8;
const SAME_COLUMN = new Set(["SIMULTANEOUS", "BEGINS", "BEGUN_BY", "BEGINS_ON", "INCLUDES", "CONTAINS", "IS_INCLUDED", "DURING", "IDENTITY"]);

function startOrder(type: string, source: string, target: string): { source: string; target: string; gap: number; priority: number } | undefined {
  switch (type.toUpperCase().replace(/-/g, "_")) {
    case "BEFORE":
    case "AFTER":
      return { source: type.toUpperCase() === "AFTER" ? target : source, target: type.toUpperCase() === "AFTER" ? source : target, gap: 1, priority: 3 };
    case "BEFORE_OVERLAP":
    case "ENDED_BY":
      return { source, target, gap: 1, priority: 2 };
    case "OVERLAP_AFTER":
    case "ENDS":
      return { source: target, target: source, gap: 1, priority: 2 };
    default:
      return undefined;
  }
}

/** Timeline layout: x follows temporal start order; y separates collisions within a rank. */
export function layoutGraph(nodes: LNode[], edges: LEdge[], nest = false, hidden?: Set<string>): LayoutResult {
  const ids = nodes.map((n) => n.id);
  const nodeSet = new Set(ids);
  const validEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
  let es = validEdges.filter((e) => e.source !== e.target);
  let selfEdges = validEdges.filter((e) => e.source === e.target);

  const temporalParent = new Map(ids.map((id) => [id, id]));
  const findTemporal = (id: string): string =>
    temporalParent.get(id) === id
      ? id
      : (temporalParent.set(id, findTemporal(temporalParent.get(id)!)), temporalParent.get(id)!);
  const timeByNode = new Map(nodes.filter((n) => n.temporalTime !== undefined && Number.isFinite(n.temporalTime)).map((n) => [n.id, n.temporalTime!]));
  const rootTime = new Map<string, number>(timeByNode);
  const joinSameStart = (a: string, b: string) => {
    const rootA = findTemporal(a);
    const rootB = findTemporal(b);
    if (rootA === rootB) return;
    const timeA = rootTime.get(rootA);
    const timeB = rootTime.get(rootB);
    // Distinct dates never share a column, even when linked by INCLUDES/DURING.
    if (timeA !== undefined && timeB !== undefined && timeA !== timeB) return;
    temporalParent.set(rootB, rootA);
    if (timeA === undefined && timeB !== undefined) rootTime.set(rootA, timeB);
  };
  for (const edge of es) {
    if (SAME_COLUMN.has(edge.type.toUpperCase().replace(/-/g, "_"))) joinSameStart(edge.source, edge.target);
  }

  const dateNodeByValue = new Map<number, string>();
  for (const node of nodes) {
    if (node.temporalTime === undefined || !Number.isFinite(node.temporalTime)) continue;
    const existing = dateNodeByValue.get(node.temporalTime);
    if (existing) joinSameStart(existing, node.id);
    else dateNodeByValue.set(node.temporalTime, node.id);
  }
  const dateGroups = new Map([...dateNodeByValue].map(([time, id]) => [time, findTemporal(id)]));

  const groups = [...new Set(ids.map(findTemporal))];
  const succ = new Map(groups.map((id) => [id, [] as { id: string; gap: number }[]]));
  const ordered = new Set<string>();
  const constraints: { source: string; target: string; gap: number; priority: number }[] = [];
  for (const e of es) {
    if (SAME_COLUMN.has(e.type.toUpperCase().replace(/-/g, "_"))) continue;
    const constraint = startOrder(e.type, findTemporal(e.source), findTemporal(e.target));
    if (constraint) constraints.push(constraint);
  }
  const chronologicalDates = [...dateGroups.entries()].sort(([a], [b]) => a - b);
  for (let index = 0; index < chronologicalDates.length - 1; index++) {
    const source = chronologicalDates[index][1];
    const target = chronologicalDates[index + 1][1];
    if (source !== target) constraints.push({ source, target, gap: 1, priority: 4 });
  }

  const reaches = (start: string, goal: string) => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === goal) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      succ.get(current)!.forEach((edge) => stack.push(edge.id));
    }
    return false;
  };
  const addOrder = (a: string, b: string, gap: number) => {
    if (a === b) return;
    succ.get(a)!.push({ id: b, gap });
    ordered.add(a);
    ordered.add(b);
  };
  constraints.sort((a, b) => b.priority - a.priority);
  for (const constraint of constraints) {
    if (!reaches(constraint.target, constraint.source)) {
      addOrder(constraint.source, constraint.target, constraint.gap);
    }
  }

  const state = new Map<string, 1 | 2>();
  const preds = new Map(groups.map((id) => [id, [] as { id: string; gap: number }[]]));
  const visit = (u: string) => {
    state.set(u, 1);
    for (const edge of succ.get(u)!) {
      const v = edge.id;
      if (state.get(v) === 1) continue;
      preds.get(v)!.push({ id: u, gap: edge.gap });
      if (!state.get(v)) visit(v);
    }
    state.set(u, 2);
  };
  groups.forEach((id) => !state.get(id) && visit(id));

  const rank = new Map<string, number>();
  const rankOf = (groupId: string): number => {
    const known = rank.get(groupId);
    if (known !== undefined) return known;
    const value = preds.get(groupId)!.reduce((max, predecessor) => Math.max(max, rankOf(predecessor.id) + predecessor.gap), 0);
    rank.set(groupId, value);
    return value;
  };
  groups.filter((id) => ordered.has(id)).forEach(rankOf);
  ids.forEach((id) => {
    const groupId = findTemporal(id);
    if (rank.has(groupId)) rank.set(id, rank.get(groupId)!);
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const e of es) {
      const sourceRank = rank.get(e.source);
      const targetRank = rank.get(e.target);
      if (sourceRank !== undefined && targetRank === undefined) (rank.set(e.target, sourceRank), (changed = true));
      else if (targetRank !== undefined && sourceRank === undefined) (rank.set(e.source, targetRank), (changed = true));
    }
  }
  ids.forEach((id) => !rank.has(id) && rank.set(id, 0));

  // Components: shift by hint, so disconnected stories follow report chronology.
  const parent = new Map(ids.map((i) => [i, i]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  es.forEach((e) => parent.set(find(e.source), find(e.target)));
  const firstInTemporalGroup = new Map<string, string>();
  for (const id of ids) {
    const temporalGroup = findTemporal(id);
    const first = firstInTemporalGroup.get(temporalGroup);
    if (first) parent.set(find(first), find(id));
    else firstInTemporalGroup.set(temporalGroup, id);
  }
  const comps = new Map<string, { minRank: number; minHint: number }>();
  for (const n of nodes) {
    const c = find(n.id);
    const cur = comps.get(c) ?? { minRank: Infinity, minHint: Infinity };
    cur.minRank = Math.min(cur.minRank, rank.get(n.id)!);
    if (n.hint !== undefined) cur.minHint = Math.min(cur.minHint, n.hint);
    comps.set(c, cur);
  }
  for (const n of nodes) {
    const c = comps.get(find(n.id))!;
    if (Number.isFinite(c.minHint)) rank.set(n.id, rank.get(n.id)! + Math.max(0, c.minHint - c.minRank));
  }
  const sameColumnRank = new Map<string, number>();
  for (const id of ids) {
    const groupId = findTemporal(id);
    sameColumnRank.set(groupId, Math.max(sameColumnRank.get(groupId) ?? -Infinity, rank.get(id)!));
  }
  for (const id of ids) rank.set(id, sameColumnRank.get(findTemporal(id))!);

  const uniq = [...new Set(rank.values())].sort((a, b) => a - b);
  const compact = new Map(uniq.map((r, i) => [r, i]));
  ids.forEach((i) => rank.set(i, compact.get(rank.get(i)!)!));

  // Columns before/after the time-anchored (date) columns form the Past/Future zones; each may span several columns.
  // Events not tied to a date and ordered before/after the dated columns are pushed out into those zones.
  let pastRange: [number, number] | undefined;
  let futureRange: [number, number] | undefined;
  let presentRange: [number, number] | undefined;
  const dateRoots = new Set(dateGroups.values());
  const isAnchored = (id: string) => dateRoots.has(findTemporal(id));
  const anchorRanks = ids.filter(isAnchored).map((id) => rank.get(id)!);
  if (anchorRanks.length) {
    const first = Math.min(...anchorRanks);
    const last = Math.max(...anchorRanks);
    const pastIds = ids.filter((id) => !isAnchored(id) && rank.get(id)! <= first);
    const futureIds = ids.filter((id) => !isAnchored(id) && rank.get(id)! >= last && !pastIds.includes(id));
    const pastShift = pastIds.length ? Math.max(0, Math.max(...pastIds.map((id) => rank.get(id)!)) - first + 1) : 0;
    const pastSet = new Set(pastIds);
    for (const id of ids) if (!pastSet.has(id)) rank.set(id, rank.get(id)! + pastShift);
    const newFirst = first + pastShift;
    const newLast = last + pastShift;
    const futureSet = new Set(futureIds);
    const futureShift = futureIds.length ? Math.max(0, newLast - Math.min(...futureIds.map((id) => rank.get(id)!)) + 1) : 0;
    for (const id of futureSet) rank.set(id, rank.get(id)! + futureShift);
    // Undated events never share a column with a date: they get their own column right after it.
    const dateRanks = [...new Set(ids.filter(isAnchored).map((id) => rank.get(id)!))].sort((a, b) => b - a);
    for (const r of dateRanks) {
      const loose = ids.filter((id) => !isAnchored(id) && rank.get(id) === r);
      if (!loose.length) continue;
      for (const id of ids) if (rank.get(id)! > r) rank.set(id, rank.get(id)! + 1);
      loose.forEach((id) => rank.set(id, r + 1));
    }
    const lastDate = Math.max(...ids.filter(isAnchored).map((id) => rank.get(id)!));
    const max = Math.max(...rank.values());
    if (newFirst > 0) pastRange = [0, newFirst - 1];
    const presentRanks = nodes.filter((n) => n.present && !isAnchored(n.id) && rank.get(n.id)! < newFirst).map((n) => rank.get(n.id)!);
    if (presentRanks.length) {
      const start = Math.min(...presentRanks);
      presentRange = [start, lastDate];
      pastRange = start > 0 ? [0, start - 1] : undefined;
    }
    if (max > lastDate && futureIds.length) futureRange = [Math.min(...futureIds.map((id) => rank.get(id)!)), max];
  }

  // Hidden nodes took part in the ranking above (so anchors are unchanged) but are dropped here:
  // empty columns are closed up and slots/nesting are computed from the visible nodes only.
  if (hidden?.size) {
    const keep = nodes.filter((n) => !hidden.has(n.id));
    const used = [...new Set(keep.map((n) => rank.get(n.id)!))].sort((a, b) => a - b);
    const remap = new Map(used.map((r, i) => [r, i]));
    const squeeze = (range?: [number, number]): [number, number] | undefined => {
      if (!range) return undefined;
      const lo = used.filter((r) => r < range[0]).length;
      const hi = used.filter((r) => r <= range[1]).length - 1;
      return lo <= hi ? [lo, hi] : undefined;
    };
    pastRange = squeeze(pastRange);
    futureRange = squeeze(futureRange);
    presentRange = squeeze(presentRange);
    for (const n of keep) rank.set(n.id, remap.get(rank.get(n.id)!)!);
    for (const n of nodes) if (hidden.has(n.id)) rank.delete(n.id);
    nodes = keep;
    es = es.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
    selfEdges = selfEdges.filter((e) => !hidden.has(e.source));
  }

  // Lanes and slots.
  const laneNames = [...new Set(nodes.map((n) => n.lane))].sort((a, b) => {
    const lanePriority = (lane: string) => lane.toUpperCase() === "DATES" ? -2 : lane.toUpperCase() === "EVENTS" ? -1 : 0;
    const priority = lanePriority(a) - lanePriority(b);
    if (priority) return priority;
    const ia = TYPE_ORDER.indexOf(a.toUpperCase());
    const ib = TYPE_ORDER.indexOf(b.toUpperCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  // Containment: INCLUDES/CONTAINS (source holds target), IS_INCLUDED/DURING (target holds source).
  const parentOf = new Map<string, string>();
  const isAncestor = (anc: string, id: string): boolean => {
    for (let cur: string | undefined = id; cur !== undefined; cur = parentOf.get(cur)) if (cur === anc) return true;
    return false;
  };
  const laneOfNode = new Map(nodes.map((n) => [n.id, n.lane]));
  const isDateLane = (id: string) => laneOfNode.get(id)?.toUpperCase() === "DATES";
  for (const e of nest ? es : []) {
    const t = e.type.toUpperCase().replace(/-/g, "_");
    let holder: string, inner: string;
    if (t === "INCLUDES" || t === "CONTAINS") [holder, inner] = [e.source, e.target];
    else if (t === "IS_INCLUDED" || t === "DURING") [holder, inner] = [e.target, e.source];
    else continue;
    // Time expressions never visually contain events; they stay in their own row, linked by an edge.
    if (isDateLane(holder) || isDateLane(inner)) continue;
    if (parentOf.has(inner) || isAncestor(inner, holder)) continue;
    parentOf.set(inner, holder);
  }
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    const p = parentOf.get(n.id);
    if (p) childrenOf.set(p, [...(childrenOf.get(p) ?? []), n.id]);
  }
  const size = new Map<string, { w: number; h: number }>();
  const sizeOf = (id: string): { w: number; h: number } => {
    const known = size.get(id);
    if (known) return known;
    const kids = childrenOf.get(id);
    let s = { w: NODE_W, h: NODE_H };
    if (kids?.length) {
      const ks = kids.map(sizeOf);
      s = {
        w: Math.max(NODE_W, ...ks.map((k) => k.w)) + NEST_PAD * 2,
        h: NODE_H + 4 + ks.reduce((sum, k) => sum + k.h, 0) + (ks.length - 1) * NEST_GAP + NEST_PAD,
      };
    }
    size.set(id, s);
    return s;
  };
  nodes.forEach((n) => sizeOf(n.id));
  const colW = Math.max(NODE_W, ...[...size.values()].map((s) => s.w)) + COL_GAP;

  const topNodes = nodes.filter((n) => !parentOf.has(n.id));
  const slotTotal = new Map<string, number>();
  const slotY = new Map<string, number>();
  for (const n of topNodes) {
    const key = `${rank.get(n.id)}|${n.lane}`;
    const used = slotTotal.get(key);
    slotY.set(n.id, used === undefined ? 0 : used + ROW_GAP);
    slotTotal.set(key, (used === undefined ? 0 : used + ROW_GAP) + size.get(n.id)!.h);
  }
  const laneMax = new Map<string, number>(laneNames.map((l) => [l, NODE_H]));
  for (const n of topNodes) {
    const key = `${rank.get(n.id)}|${n.lane}`;
    laneMax.set(n.lane, Math.max(laneMax.get(n.lane)!, slotTotal.get(key)!));
  }
  const lanes: LayoutResult["lanes"] = [];
  const laneTop = new Map<string, number>();
  let y = TOP;
  for (const l of laneNames) {
    const h = laneMax.get(l)! + LANE_PAD * 2;
    lanes.push({ name: l, y, h });
    laneTop.set(l, y);
    y += h;
  }

  const pos = new Map<string, Pos>();
  const place = (id: string, x: number, py: number) => {
    pos.set(id, { x, y: py });
    let cy = py + NODE_H + 4;
    for (const k of childrenOf.get(id) ?? []) {
      place(k, x + NEST_PAD, cy);
      cy += size.get(k)!.h + NEST_GAP;
    }
  };
  for (const n of topNodes) {
    place(n.id, LEFT + rank.get(n.id)! * colW, laneTop.get(n.lane)! + LANE_PAD + slotY.get(n.id)!);
  }
  const NODE_W_OF = (id: string) => size.get(id)!.w;
  const NODE_H_OF = (id: string) => size.get(id)!.h;
  const containment = new Set(es.filter((e) => parentOf.get(e.target) === e.source || parentOf.get(e.source) === e.target).map((e) => e.id));

  const outEdges = [
    ...es.filter((e) => !containment.has(e.id)).map((e) => {
      const s = pos.get(e.source)!;
      const t = pos.get(e.target)!;
      const sw = NODE_W_OF(e.source), sh = NODE_H_OF(e.source), tw = NODE_W_OF(e.target), th = NODE_H_OF(e.target);
      const sHead = childrenOf.has(e.source) ? NODE_H : sh;
      const tHead = childrenOf.has(e.target) ? NODE_H : th;
      let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number;
      if (t.x > s.x + 1) {
        x1 = s.x + sw; y1 = s.y + sHead / 2; x2 = t.x; y2 = t.y + tHead / 2;
        const dx = Math.max(30, (x2 - x1) / 2);
        c1x = x1 + dx; c1y = y1; c2x = x2 - dx; c2y = y2;
      } else if (t.x < s.x - 1) {
        x1 = s.x; y1 = s.y + sHead / 2; x2 = t.x + tw; y2 = t.y + tHead / 2;
        const dx = Math.max(30, (x1 - x2) / 2);
        c1x = x1 - dx; c1y = y1; c2x = x2 + dx; c2y = y2;
      } else {
        const down = t.y > s.y;
        x1 = s.x + sw / 2;
        x2 = t.x + tw / 2;
        y1 = down ? s.y + sh : s.y;
        y2 = down ? t.y : t.y + th;
        c1x = x1 + 60; c1y = y1 + (y2 - y1) / 3; c2x = x2 + 60; c2y = y1 + (2 * (y2 - y1)) / 3;
      }
      return {
        id: e.id,
        d: `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`,
        lx: (x1 + 3 * c1x + 3 * c2x + x2) / 8,
        ly: (y1 + 3 * c1y + 3 * c2y + y2) / 8,
      };
    }),
    ...selfEdges.map((e) => {
      const p = pos.get(e.source)!;
      const x = p.x + NODE_W_OF(e.source);
      const y1 = p.y + 8;
      const y2 = p.y + NODE_H - 8;
      return {
        id: e.id,
        d: `M${x},${y1} C${x + 44},${y1} ${x + 44},${y2} ${x},${y2}`,
        lx: x + 34,
        ly: p.y + NODE_H / 2,
      };
    }),
  ];

  const maxRank = Math.max(0, ...rank.values());
  const zones: LayoutResult["zones"] = [];
  if (pastRange) zones.push({ name: "Past", x: LEFT + pastRange[0] * colW - COL_GAP / 2, w: (pastRange[1] - pastRange[0] + 1) * colW });
  if (presentRange) zones.push({ name: "Present", x: LEFT + presentRange[0] * colW - COL_GAP / 2, w: (presentRange[1] - presentRange[0] + 1) * colW });
  if (futureRange) zones.push({ name: "Future", x: LEFT + futureRange[0] * colW - COL_GAP / 2, w: (futureRange[1] - futureRange[0] + 1) * colW });
  return {
    zones,
    pos,
    edges: outEdges,
    lanes,
    width: LEFT + (maxRank + 1) * colW,
    height: y + TOP,
    size,
    depth: (id: string) => {
      let d = 0;
      for (let c = parentOf.get(id); c !== undefined; c = parentOf.get(c)) d++;
      return d;
    },
    hiddenEdges: containment,
  };
}
