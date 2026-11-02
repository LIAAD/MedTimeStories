import type { Indexes } from "../data/loader";
import type { ClinEvent, Patient } from "../data/schema";

export interface CrossRelation {
  id: string;
  type: string;
  source: ClinEvent;
  target: ClinEvent;
}

/** Relations of a patient whose two events are in different reports. */
export function crossReportRelations(idx: Indexes, patient: Patient): CrossRelation[] {
  const out: CrossRelation[] = [];
  for (const t of patient.reports.flatMap((r) => r.temporalRelations)) {
    const source = idx.events.get(t.source);
    const target = idx.events.get(t.target);
    if (source && target && source.reportId !== target.reportId) out.push({ id: t.id, type: t.type, source, target });
  }
  return out;
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

export type DateMarker = "admission" | "discharge";

export function dateMarker(event: ClinEvent): DateMarker | undefined {
  if (!isDateTimeExpression(event)) return undefined;
  const fn = event.attributes?.TemporalFunction;
  return fn === "AdmissionTime" ? "admission" : fn === "DischargeTime" ? "discharge" : undefined;
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
  if (label === "Time") {
    const timeType = String(attrs.Time_Type ?? "Time");
    const fn = attrs.TemporalFunction ? ` · ${attrs.TemporalFunction}` : "";
    return { type: timeType === "Date" ? "Time" : `Time (${timeType})`, sublabel: `${timeType}${timeType === "Date" ? fn : ""}` };
  }
  return { type: event.type, sublabel: event.type.toLowerCase() };
}

export function graphEventLane(event: ClinEvent): string {
  return isDateTimeExpression(event) ? "Dates" : "Events";
}

function utcDate(year: number, month: number, day: number): number | undefined {
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return timestamp;
}

export function graphEventTime(event: ClinEvent): number | undefined {
  if (!isDateTimeExpression(event)) return undefined;
  const value = event.attributes?.Value;
  if (typeof value === "string") {
    const match = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(value.trim());
    if (match) return utcDate(Number(match[1]), Number(match[2] ?? 1), Number(match[3] ?? 1));
  }
  // No usable Value: accept a day-first date written in the text itself (e.g. 20/04/2022).
  const text = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(event.surface.trim());
  return text ? utcDate(Number(text[3]), Number(text[2]), Number(text[1])) : undefined;
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
