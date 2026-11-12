import type { ClinEvent, Patient, Report, TemporalRelation } from "../data/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fs = Record<string, any>;

function resolveDate(text: string): string | undefined {
  const patterns = [
    /Data\s+Alta\s+Cl[ií]nica\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
    /Data\s+de\s+registo\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
    /Data\s+Admiss[aã]o\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
}

function attributesOf(span: Fs): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};
  if (span.Polarity) {
    const p = String(span.Polarity).toLowerCase();
    attrs.polarity = p === "neg" ? "NEGATED" : p === "pos" ? "POSITIVE" : span.Polarity;
  }
  if (span.SpecializedEventClass) attrs.specializedEventClass = span.SpecializedEventClass;
  for (const [k, v] of Object.entries(span)) {
    if (k.startsWith("%") || k.startsWith("@") || ["begin", "end", "label", "Polarity", "SpecializedEventClass"].includes(k)) continue;
    if (["string", "number", "boolean"].includes(typeof v)) attrs[k] = v as string | number | boolean;
  }
  return attrs;
}

function splitReports(text: string) {
  const out: { start: number; end: number; text: string }[] = [];
  const add = (start: number, end: number) => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const from = start + raw.indexOf(trimmed);
    out.push({ start: from, end: from + trimmed.length, text: trimmed });
  };
  const sep = /(?:\r?\n[ \t]*){2,}/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(text))) {
    add(start, m.index);
    start = m.index + m[0].length;
  }
  add(start, text.length);
  return out;
}

/** Browser port of scripts/convert-inception.mjs for a single CAS JSON document. */
export function casToPatient(cas: Fs, patientId: string): Patient {
  const structures: Fs[] = Object.values(cas["%FEATURE_STRUCTURES"] ?? {});
  const sofa = structures.find((s) => s["%TYPE"] === "uima.cas.Sofa");
  if (!sofa || typeof sofa.sofaString !== "string") throw new Error("The annotation has no text.");
  const members = structures.filter((s) => s["@sofa"] === sofa["%ID"]);
  const spans = members.filter((s) => s["%TYPE"] === "custom.Span");
  const relations = members.filter((s) => s["%TYPE"] === "custom.Relation");
  // a lone CR is a line break too; swapping it for LF keeps the length, so the span offsets stay valid
  const text: string = sofa.sofaString.replace(/\r(?!\n)/g, "\n");

  const segments = splitReports(text);
  const reports: (Report & { s: number; e: number })[] = segments.map((seg, i) => {
    const date = resolveDate(seg.text);
    return {
      id: `${patientId}_R${i + 1}`,
      patientId,
      title: `Pasted report ${i + 1}`,
      type: "clinical note",
      ...(date ? { date } : {}),
      text: seg.text,
      events: [],
      temporalRelations: [],
      s: seg.start,
      e: seg.end,
    };
  });

  const eventByCasId = new Map<string, ClinEvent>();
  const reportOfEvent = new Map<string, Report>();
  for (const span of spans.sort((a, b) => a.begin - b.begin || a.end - b.end)) {
    const report = reports.find((r) => span.begin >= r.s && span.end <= r.e);
    if (!report || span.end <= span.begin) continue;
    const start = span.begin - report.s;
    const end = span.end - report.s;
    const event: ClinEvent = {
      id: `${report.id}_e${report.events.length + 1}`,
      reportId: report.id,
      start,
      end,
      surface: report.text.slice(start, end),
      type: span.label ?? "General Event",
      attributes: attributesOf(span),
    };
    eventByCasId.set(String(span["%ID"]), event);
    reportOfEvent.set(event.id, report);
    report.events.push(event);
  }

  for (const rel of relations) {
    const link = rel.temporal_links;
    if (typeof link !== "string" || !link.startsWith("TLINK_")) continue;
    const source = eventByCasId.get(String(rel["@Governor"]));
    const target = eventByCasId.get(String(rel["@Dependent"]));
    if (!source || !target) continue;
    const owner = reportOfEvent.get(source.id)!;
    const t: TemporalRelation = {
      id: `${owner.id}_t${owner.temporalRelations.length + 1}`,
      source: source.id,
      target: target.id,
      type: link.replace(/^TLINK_/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(),
    };
    owner.temporalRelations.push(t);
  }

  return { id: patientId, annotated: true, identityRelations: [], reports: reports.map(({ s: _s, e: _e, ...r }) => r) };
}
