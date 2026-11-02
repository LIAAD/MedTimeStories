import {
  validateDataset,
  type ClinEvent,
  type Dataset,
  type Patient,
  type Report,
  type TemporalRelation,
} from "./schema";
import { graphEventKind } from "../lib/util";
/** Override with VITE_DATASET_URL in .env.local, or pass a URL to loadDataset(). */
export const DEFAULT_DATASET_URL: string = import.meta.env.VITE_DATASET_URL ?? "/data/dataset.json";

export interface RelationRef {
  relation: TemporalRelation;
  direction: "out" | "in";
  other: string;
}

export interface PatientStats {
  reportCount: number;
  eventCount: number;
  relationCount: number;
  crossRelationCount: number;
}

export interface Indexes {
  patients: Map<string, Patient>;
  reports: Map<string, Report>;
  events: Map<string, ClinEvent>;
  relationsByEvent: Map<string, RelationRef[]>;
  patientStats: Map<string, PatientStats>;
  /** Chronological position of a report within its patient (0-based). */
  reportIndex: Map<string, number>;
  eventTypes: string[];
  relationTypes: string[];
}

export interface LoadedDataset {
  data: Dataset;
  idx: Indexes;
}

export function compareReports(a: Report, b: Report): number {
  const da = a.date ? Date.parse(a.date) : Infinity;
  const db = b.date ? Date.parse(b.date) : Infinity;
  return da - db || a.id.localeCompare(b.id);
}

export function buildIndexes(data: Dataset): Indexes {
  const idx: Indexes = {
    patients: new Map(),
    reports: new Map(),
    events: new Map(),
    relationsByEvent: new Map(),
    patientStats: new Map(),
    reportIndex: new Map(),
    eventTypes: [],
    relationTypes: [],
  };
  const eventTypes = new Set<string>();
  const relTypes = new Set<string>();
  const push = (id: string, ref: RelationRef) => {
    const list = idx.relationsByEvent.get(id);
    if (list) list.push(ref);
    else idx.relationsByEvent.set(id, [ref]);
  };

  for (const p of data.patients) {
    idx.patients.set(p.id, p);
    [...p.reports].sort(compareReports).forEach((r, i) => idx.reportIndex.set(r.id, i));
    for (const r of p.reports) {
      idx.reports.set(r.id, r);
      for (const e of r.events) {
        idx.events.set(e.id, e);
        eventTypes.add(graphEventKind(e).type);
      }
    }
  }

  for (const p of data.patients) {
    let relationCount = 0;
    let crossRelationCount = 0;
    let eventCount = 0;
    for (const r of p.reports) {
      eventCount += r.events.length;
      for (const t of r.temporalRelations) {
        relationCount++;
        if (idx.events.get(t.source)?.reportId !== idx.events.get(t.target)?.reportId) crossRelationCount++;
        relTypes.add(t.type);
        push(t.source, { relation: t, direction: "out", other: t.target });
        push(t.target, { relation: t, direction: "in", other: t.source });
      }
    }
    idx.patientStats.set(p.id, { reportCount: p.reports.length, eventCount, relationCount, crossRelationCount });
  }

  idx.eventTypes = [...eventTypes].sort();
  idx.relationTypes = [...relTypes].sort();
  return idx;
}

/**
 * Loads, validates and indexes the dataset.
 * `adapt` lets you convert your own JSON layout into the expected shape before validation.
 */
export async function loadDataset(
  url: string = DEFAULT_DATASET_URL,
  adapt: (raw: unknown) => unknown = (raw) => raw,
): Promise<LoadedDataset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch dataset from "${url}" (HTTP ${res.status}).`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new Error(`"${url}" is not valid JSON.`);
  }
  const data = validateDataset(adapt(raw));
  return { data, idx: buildIndexes(data) };
}
