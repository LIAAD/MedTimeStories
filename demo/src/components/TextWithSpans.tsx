import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type { ClinEvent } from "../data/schema";
import { typeStyle } from "../lib/colors";
import { graphEventKind } from "../lib/util";

export interface Arrow {
  source: string;
  target: string;
  type: string;
  identity?: boolean;
}

interface Props {
  text: string;
  events: ClinEvent[];
  selectedId?: string | null;
  relatedIds: Set<string>;
  isDimmed: (e: ClinEvent) => boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  arrows?: Arrow[];
  showArrowLabels?: boolean;
  highlightArrows?: boolean;
}

interface Segment {
  from: number;
  to: number;
  active: ClinEvent[];
  primary?: ClinEvent;
  starts: string[];
}

/** Splits the text at every span boundary so overlapping/nested/adjacent events never corrupt the markup. */
function buildSegments(text: string, events: ClinEvent[]): Segment[] {
  const pts = new Set<number>([0, text.length]);
  for (const e of events) {
    pts.add(e.start);
    pts.add(e.end);
  }
  const sorted = [...pts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const segs: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const active = events.filter((e) => e.start <= from && e.end >= to);
    // Innermost (shortest) span wins the colour and click target.
    const primary = [...active].sort((a, b) => a.end - a.start - (b.end - b.start) || b.start - a.start)[0];
    segs.push({ from, to, active, primary, starts: active.filter((e) => e.start === from).map((e) => e.id) });
  }
  return segs;
}

export default function TextWithSpans({ text, events, selectedId, relatedIds, isDimmed, onSelect, onHover, arrows, showArrowLabels = false, highlightArrows = false }: Props) {
  const segments = useMemo(() => buildSegments(text, events), [text, events]);
  const ref = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; lx: number; ly: number; type: string; identity?: boolean; key: string }[]>([]);

  useEffect(() => {
    if (!selectedId || !ref.current) return;
    ref.current.querySelector(`[data-starts~="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !arrows?.length) {
      setPaths([]);
      return;
    }
    const compute = () => {
      const cb = c.getBoundingClientRect();
      const anchors = new Map<string, DOMRect>();
      c.querySelectorAll<HTMLElement>("[data-starts]").forEach((el) => {
        const r = el.getBoundingClientRect();
        el.dataset.starts!.split(" ").forEach((id) => !anchors.has(id) && anchors.set(id, r));
      });
      const out: typeof paths = [];
      arrows.forEach((a, i) => {
        const s = anchors.get(a.source);
        const t = anchors.get(a.target);
        if (!s || !t) return;
        const x1 = s.left + s.width / 2 - cb.left;
        const y1 = s.top - cb.top;
        const x2 = t.left + t.width / 2 - cb.left;
        const y2 = t.top - cb.top;
        const yc = Math.min(y1, y2) - 8 - Math.min(Math.abs(x2 - x1) * 0.03, 12);
        out.push({
          d: `M${x1},${y1} C${x1},${yc} ${x2},${yc} ${x2},${y2}`,
          lx: (x1 + x2) / 2,
          ly: (y1 + 6 * yc + y2) / 8,
          type: a.type,
          identity: a.identity,
          key: `${a.source}>${a.target}>${a.type}>${i}`,
        });
      });
      const placed: { x: number; y: number; w: number }[] = [];
      out.forEach((p) => {
        const w = p.type.length * 5.4 + 6;
        let y = p.ly;
        for (let step = 0; step < 3 && placed.some((q) => Math.abs(q.x - p.lx) < (q.w + w) / 2 && Math.abs(q.y - y) < 10); step++) y -= 10;
        placed.push({ x: p.lx, y, w });
        p.ly = y;
      });
      setPaths(out);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(c);
    return () => ro.disconnect();
  }, [arrows, segments]);

  return (
    <div ref={ref} className={`relative whitespace-pre-wrap text-[15px] ${arrows?.length ? "leading-[3.4]" : "leading-[2.5]"}`}>
      {segments.map((s) => {
        const body = text.slice(s.from, s.to);
        if (!s.primary) return <span key={s.from}>{body}</span>;
        const p = s.primary;
        const isSel = !!selectedId && s.active.some((e) => e.id === selectedId);
        const isRel = s.active.some((e) => relatedIds.has(e.id));
        const dim = isDimmed(p);
        return (
          <span
            key={s.from}
            role="button"
            tabIndex={-1}
            data-ev={p.id}
            data-starts={s.starts.length ? s.starts.join(" ") : undefined}
            title={`${graphEventKind(p).sublabel}: ${p.surface}`}
            onClick={() => onSelect(p.id)}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
            className={[
              "cursor-pointer rounded-sm px-0.5 transition",
              typeStyle(graphEventKind(p).type).mark,
              isSel ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900" : "",
              isRel && !isSel ? "outline-2 outline-dashed outline-slate-500 dark:outline-slate-300" : "",
              dim ? "opacity-25" : "",
            ].join(" ")}
          >
            {body}
          </span>
        );
      })}
      {paths.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <marker id="txt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="fill-indigo-500" />
            </marker>
          </defs>
          {paths.map((p) => (
            <g key={p.key}>
              <title>{p.type}</title>
              <path
                d={p.d}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray={p.identity ? "5 4" : undefined}
                className={`pointer-events-auto ${p.identity ? (highlightArrows ? "stroke-fuchsia-600/80" : "stroke-fuchsia-500/50") : highlightArrows ? "stroke-indigo-500/70" : "stroke-slate-500/45"}`}
                markerEnd={p.identity ? undefined : "url(#txt-arrow)"}
              />
              {showArrowLabels && (
                <text
                  x={p.lx}
                  y={p.ly}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight={600}
                  strokeWidth={3}
                  opacity={0.9}
                  className={`pointer-events-none stroke-white dark:stroke-slate-900 [paint-order:stroke] ${p.identity ? "fill-fuchsia-700 dark:fill-fuchsia-300" : "fill-indigo-700 dark:fill-indigo-300"}`}
                >
                  {p.type.replace(/_/g, " ").toLowerCase()}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
