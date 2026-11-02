import { z } from "zod";

const attrValue = z.union([z.string(), z.number(), z.boolean()]);

export const EventSchema = z.object({
  id: z.string().min(1),
  reportId: z.string().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  surface: z.string().min(1),
  type: z.string().min(1),
  attributes: z.record(attrValue).optional(),
});

export const TemporalRelationSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  // Open vocabulary (BEFORE, AFTER, OVERLAP, CONTAINS, BEGINS-ON, ENDS-ON, SIMULTANEOUS, IDENTITY, ...)
  type: z.string().min(1).transform((s) => s.toUpperCase()),
});

export const ReportSchema = z
  .object({
    id: z.string().min(1),
    patientId: z.string().min(1),
    title: z.string(),
    type: z.string(),
    date: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined)
      .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), "date must be a valid ISO date string"),
    text: z.string(),
    events: z.array(EventSchema),
    temporalRelations: z.array(TemporalRelationSchema).default([]),
  })
  .superRefine((r, ctx) => {
    r.events.forEach((e, i) => {
      const where = `event "${e.id}" in report "${r.id}"`;
      const add = (path: string, message: string) =>
        ctx.addIssue({ code: "custom", path: ["events", i, path], message: `${where}: ${message}` });
      if (e.reportId !== r.id) add("reportId", `reportId "${e.reportId}" does not match enclosing report`);
      if (e.end <= e.start) return add("end", `end (${e.end}) must be greater than start (${e.start})`);
      if (e.end > r.text.length) return add("end", `end offset ${e.end} exceeds text length ${r.text.length}`);
      const actual = r.text.slice(e.start, e.end);
      if (actual !== e.surface) {
        add("surface", `offsets [${e.start}, ${e.end}) select "${actual}" but surface is "${e.surface}"`);
      }
    });
  });

export const PatientSchema = z.object({
  id: z.string().min(1),
  reports: z.array(ReportSchema),
});

export const DatasetSchema = z.object({ patients: z.array(PatientSchema) });

export type ClinEvent = z.infer<typeof EventSchema>;
export type TemporalRelation = z.infer<typeof TemporalRelationSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type Patient = z.infer<typeof PatientSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;

export class DatasetValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Dataset validation failed with ${issues.length} issue(s)`);
    this.name = "DatasetValidationError";
  }
}

function formatPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), "");
}

function checkReferences(data: Dataset): string[] {
  const issues: string[] = [];
  const seenEvents = new Set<string>();
  const seenReports = new Set<string>();
  for (const p of data.patients) {
    const own = new Set<string>();
    for (const r of p.reports) {
      if (seenReports.has(r.id)) issues.push(`Duplicate report id "${r.id}"`);
      seenReports.add(r.id);
      if (r.patientId !== p.id) issues.push(`Report "${r.id}" has patientId "${r.patientId}" but is nested in patient "${p.id}"`);
      for (const e of r.events) {
        if (seenEvents.has(e.id)) issues.push(`Duplicate event id "${e.id}" (event ids must be globally unique)`);
        seenEvents.add(e.id);
        own.add(e.id);
      }
    }
    for (const r of p.reports) {
      for (const t of r.temporalRelations) {
        for (const end of ["source", "target"] as const) {
          if (!own.has(t[end])) issues.push(`Relation "${t.id}" (report "${r.id}"): ${end} "${t[end]}" is not an event of patient "${p.id}"`);
        }
      }
    }
  }
  return issues;
}

/** Validates raw JSON (either `{patients: [...]}` or a bare array of patients). */
export function validateDataset(raw: unknown): Dataset {
  const input = Array.isArray(raw) ? { patients: raw } : raw;
  const parsed = DatasetSchema.safeParse(input);
  if (!parsed.success) {
    throw new DatasetValidationError(
      parsed.error.issues.map((i) => `${formatPath(i.path) || "(root)"}: ${i.message}`),
    );
  }
  const refIssues = checkReferences(parsed.data);
  if (refIssues.length) throw new DatasetValidationError(refIssues);
  return parsed.data;
}
