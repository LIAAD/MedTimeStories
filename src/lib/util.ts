import type { Chain, Indexes } from "../data/loader";
import type { ClinEvent } from "../data/schema";

export function chainEvents(idx: Indexes, chain: Chain): ClinEvent[] {
  return chain.chain
    .map((id) => idx.events.get(id))
    .filter((e): e is ClinEvent => !!e)
    .sort(
      (a, b) =>
        (idx.reportIndex.get(a.reportId) ?? 0) - (idx.reportIndex.get(b.reportId) ?? 0) || a.start - b.start,
    );
}

export function reportUrl(patientId: string, reportId: string, eventId?: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams(extra);
  if (eventId) q.set("event", eventId);
  const qs = q.toString();
  return `/patient/${encodeURIComponent(patientId)}/report/${encodeURIComponent(reportId)}${qs ? `?${qs}` : ""}`;
}

export function eventUrl(idx: Indexes, eventId: string): string {
  const ev = idx.events.get(eventId)!;
  const r = idx.reports.get(ev.reportId)!;
  return reportUrl(r.patientId, r.id, eventId);
}

export function isDateTimeExpression(event: ClinEvent): boolean {
  return event.type.toLowerCase() === "time" && event.attributes?.Time_Type === "Date";
}

export function graphEventLabel(event: ClinEvent): string {
  const value = event.attributes?.Value;
  return isDateTimeExpression(event) && typeof value === "string" && value
    ? value
    : event.surface;
}

/** Original annotation kind: General Event (+ Class), Specialized Event (+ specialized class), or Time. */
export function graphEventKind(event: ClinEvent): { type: string; sublabel: string } {
  const attrs = event.attributes ?? {};
  const label = event.type;
  if (label === "General Event") {
    return { type: label, sublabel: attrs.Class ? `General · ${attrs.Class}` : "General Event" };
  }
  if (label === "Specialized Event") {
    return { type: String(attrs.specializedEventClass ?? label), sublabel: String(attrs.specializedEventClass ?? "Specialized Event") };
  }
  if (label === "Time") return { type: "Time", sublabel: String(attrs.Time_Type ?? "Time") };
  return { type: event.type, sublabel: event.type.toLowerCase() };
}

export function graphEventLane(event: ClinEvent): string {
  return isDateTimeExpression(event) ? "Dates" : "Events";
}

export function graphEventTime(event: ClinEvent): number | undefined {
  if (!isDateTimeExpression(event)) return undefined;
  const value = event.attributes?.Value;
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2] ?? 1);
  const day = Number(match[3] ?? 1);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return timestamp;
}

export function reportLabel(idx: Indexes, reportId: string): string {
  return `R${(idx.reportIndex.get(reportId) ?? 0) + 1}`;
}

export function formatDate(d?: string): string {
  if (!d) return "undated";
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const words = (t: string) => [...t.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ w: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
const stem = (w: string) => w.slice(0, 5);

/**
 * Locates each translated surface inside the English text. Exact matches closest to the expected
 * (proportional) position win; otherwise the word window with the best stem overlap near that position is used.
 * Events with no convincing match are left unhighlighted.
 */
export function alignEnglish(textEn: string, events: ClinEvent[], sourceLength: number): ClinEvent[] {
  const hay = textEn.toLowerCase();
  const toks = words(textEn);
  const ratio = textEn.length / Math.max(sourceLength, 1);
  const out: ClinEvent[] = [];
  for (const e of events) {
    const needle = e.surfaceEn?.trim().toLowerCase();
    if (!needle) continue;
    const expected = e.start * ratio;
    let best: { start: number; end: number } | null = null;
    let bestDist = Infinity;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
      const d = Math.abs(i - expected);
      if (d < bestDist) (bestDist = d), (best = { start: i, end: i + needle.length });
    }
    if (!best) {
      const target = words(needle).map((t) => stem(t.w));
      if (target.length) {
        const radius = Math.max(120, textEn.length * 0.15);
        let bestScore = 0;
        for (let a = 0; a < toks.length; a++) {
          if (Math.abs(toks[a].start - expected) > radius) continue;
          for (let n = Math.max(1, target.length - 1); n <= target.length + 1 && a + n <= toks.length; n++) {
            const win = toks.slice(a, a + n).map((t) => stem(t.w));
            const common = target.filter((t) => win.includes(t)).length;
            const score = common / Math.max(target.length, n) - Math.abs(toks[a].start - expected) / (radius * 20);
            if (common > 0 && score > bestScore && common / target.length >= 0.5) {
              bestScore = score;
              best = { start: toks[a].start, end: toks[a + n - 1].end };
            }
          }
        }
      }
    }
    if (best) out.push({ ...e, start: best.start, end: best.end });
  }
  return out;
}
export function withEnglishSurfaces(events: ClinEvent[]): ClinEvent[] {
  return events.map((e) => (e.surfaceEn ? { ...e, surface: e.surfaceEn } : e));
}
