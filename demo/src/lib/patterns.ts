import type { Dataset } from "../data/schema";
import { graphEventKind } from "./util";

export interface ConnectionPattern {
  sourceType: string;
  relationType: string;
  targetType: string;
  count: number;
  patientCount: number;
  /** Relations whose endpoints are in different reports of the same patient. */
  crossReportCount: number;
}

export interface PatternSummary {
  patterns: ConnectionPattern[];
  eventTypes: string[];
  relationTypes: string[];
  totalRelations: number;
}

/** Aggregates temporal relations over all patients as (source type, relation, target type) counts. */
export function aggregateConnections(data: Dataset): PatternSummary {
  const acc = new Map<string, ConnectionPattern & { patients: Set<string> }>();
  const eventTypes = new Set<string>();
  const relationTypes = new Set<string>();
  let totalRelations = 0;

  for (const p of data.patients) {
    const events = new Map(p.reports.flatMap((r) => r.events).map((e) => [e.id, e]));
    for (const e of events.values()) eventTypes.add(graphEventKind(e).type);
    for (const r of p.reports) {
      for (const t of r.temporalRelations) {
        const s = events.get(t.source);
        const d = events.get(t.target);
        if (!s || !d) continue;
        const sourceType = graphEventKind(s).type;
        const targetType = graphEventKind(d).type;
        const key = JSON.stringify([sourceType, t.type, targetType]);
        let row = acc.get(key);
        if (!row) {
          row = { sourceType, relationType: t.type, targetType, count: 0, patientCount: 0, crossReportCount: 0, patients: new Set() };
          acc.set(key, row);
        }
        row.count++;
        if (s.reportId !== d.reportId) row.crossReportCount++;
        row.patients.add(p.id);
        relationTypes.add(t.type);
        totalRelations++;
      }
    }
  }

  const patterns = [...acc.values()]
    .map(({ patients, ...row }) => ({ ...row, patientCount: patients.size }))
    .sort((a, b) => b.count - a.count);
  return {
    patterns,
    eventTypes: [...eventTypes].sort(),
    relationTypes: [...relationTypes].sort(),
    totalRelations,
  };
}
