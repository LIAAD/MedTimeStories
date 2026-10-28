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
  return event.type.toUpperCase() === "TIME" && event.attributes?.Time_Type === "Date";
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
  const label = String(attrs.inceptionLabel ?? "");
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
