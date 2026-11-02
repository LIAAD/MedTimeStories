import {
  validateDataset,
  type ClinEvent,
  type Dataset,
  type IdentityRelation,
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

export interface Chain extends IdentityRelation {
  patientId: string;
  reportIds: string[];
  crossReport: boolean;
}

export interface PatientStats {
  reportCount: number;
  eventCount: number;
  relationCount: number;
  chainCount: number;
  crossChainCount: number;
}

export interface Indexes {
  patients: Map<string, Patient>;
  reports: Map<string, Report>;
  events: Map<string, ClinEvent>;
  relationsByEvent: Map<string, RelationRef[]>;
  chainByEvent: Map<string, Chain>;
  chainsByPatient: Map<string, Chain[]>;
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
    chainByEvent: new Map(),
    chainsByPatient: new Map(),
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
    let eventCount = 0;
    for (const r of p.reports) {
      eventCount += r.events.length;
      for (const t of r.temporalRelations) {
        relationCount++;
        relTypes.add(t.type);
        push(t.source, { relation: t, direction: "out", other: t.target });
        push(t.target, { relation: t, direction: "in", other: t.source });
      }
    }
    const chains: Chain[] = p.identityRelations.map((c) => {
      const reportIds = [...new Set(c.chain.map((id) => idx.events.get(id)!.reportId))];
      const chain: Chain = { ...c, patientId: p.id, reportIds, crossReport: reportIds.length > 1 };
      for (const id of c.chain) idx.chainByEvent.set(id, chain);
      return chain;
    });
    idx.chainsByPatient.set(p.id, chains);
    idx.patientStats.set(p.id, {
      reportCount: p.reports.length,
      eventCount,
      relationCount,
      chainCount: chains.length,
      crossChainCount: chains.filter((c) => c.crossReport).length,
    });
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
