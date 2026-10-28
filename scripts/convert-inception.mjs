import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";

const TYPE_MAP = {
  "Characterization of the Disease": "PROBLEM",
  Examination: "TEST",
  "Examination Result": "TEST",
  "Drug Administration Route": "TREATMENT",
  Intercurrence: "PROBLEM",
  "Medical Procedure": "TREATMENT",
  "Personal History": "PROBLEM",
  "Principal Diagnosis": "PROBLEM",
  "Sign or Symptom": "PROBLEM",
  Treatment: "TREATMENT",
  "Treatment Response": "PROBLEM",
};
function usage() {
  console.log(`Usage: node scripts/convert-inception.mjs <cas.json> [cas.json ...] [options]

Options:
  --out <file>       Output path (default: annotations/converted-dataset.json)
  --config <file>    Optional JSON metadata map keyed by input filename
  --help             Show this help

Provide each input JSON file as a separate argument.`);
}

function parseArgs(args) {
  const options = { inputs: [], output: "annotations/converted-dataset.json" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--out" || arg === "--config") {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      options[arg === "--out" ? "output" : "config"] = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }
  return options;
}

function safeId(value) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function resolveDate(text) {
  const patterns = [
    /Data\s+Alta\s+Cl[ií]nica\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
    /Data\s+de\s+registo\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
    /Data\s+Admiss[aã]o\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
}

function annotationType(span) {
  if (span.label === "Time") return "TIME";
  if (span.label === "General Event") return "General Event";
  if (span.SpecializedEventClass) return TYPE_MAP[span.SpecializedEventClass] ?? "PROBLEM";
  return "General Event";
}

function annotationAttributes(span) {
  const attributes = {};
  if (span.Polarity) {
    const polarity = span.Polarity.toLowerCase();
    attributes.polarity = polarity === "neg" ? "NEGATED" : polarity === "pos" ? "POSITIVE" : span.Polarity;
  }
  if (span.label) attributes.inceptionLabel = span.label;
  if (span.SpecializedEventClass) attributes.specializedEventClass = span.SpecializedEventClass;

  for (const [key, value] of Object.entries(span)) {
    if (key.startsWith("%") || key.startsWith("@") || ["begin", "end", "label", "Polarity", "SpecializedEventClass"].includes(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) attributes[key] = value;
  }
  return attributes;
}

function relationType(value) {
  return value.replace(/^TLINK_/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function readCas(path) {
  const cas = JSON.parse(readFileSync(path, "utf8"));
  const structures = Object.values(cas["%FEATURE_STRUCTURES"] ?? {});
  const sofa = structures.find((item) => item["%TYPE"] === "uima.cas.Sofa");
  if (!sofa || typeof sofa.sofaString !== "string") throw new Error(`${path}: missing UIMA sofa text`);

  const sofaId = sofa["%ID"];
  const members = structures.filter((item) => item["@sofa"] === sofaId);
  const spans = members.filter((item) => item["%TYPE"] === "custom.Span");
  const relations = members.filter((item) => item["%TYPE"] === "custom.Relation");
  if (!spans.length) throw new Error(`${path}: no custom.Span annotations found`);
  return { text: sofa.sofaString, spans, relations };
}

function splitReports(text) {
  const reports = [];
  const separator = /\r?\n[ \t]*\r?\n/g;
  let start = 0;
  let match;
  while ((match = separator.exec(text))) {
    if (match.index > start) {
      reports.push({ start, end: match.index, text: text.slice(start, match.index) });
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) reports.push({ start, end: text.length, text: text.slice(start) });
  return reports;
}

function convertDocument(path, config = {}) {
  const cas = readCas(path);
  const fileName = basename(path);
  const fallback = safeId(basename(path, extname(path)));
  const patientId = config.patientId ?? `P_${fallback}`;
  const segments = splitReports(cas.text);
  if (!segments.length) throw new Error(`${path}: no report text found in CAS sofa`);
  if (config.reports && !Array.isArray(config.reports)) {
    throw new Error(`${path}: config.reports must be an array`);
  }

  const reports = segments.map((segment, index) => {
    const metadata = config.reports?.[index] ?? {};
    const reportId = metadata.reportId ?? `R_${fallback}_${index + 1}`;
    return {
      id: reportId,
      patientId,
      title: metadata.title ?? `${fileName} - Report ${index + 1}`,
      type: metadata.type ?? "clinical note",
      ...(metadata.date ?? resolveDate(segment.text) ? { date: metadata.date ?? resolveDate(segment.text) } : {}),
      text: segment.text,
      events: [],
      temporalRelations: [],
      sourceStart: segment.start,
      sourceEnd: segment.end,
    };
  });
  const reportIds = new Set();
  for (const report of reports) {
    if (reportIds.has(report.id)) throw new Error(`${path}: duplicate report ID "${report.id}"`);
    reportIds.add(report.id);
  }

  const spanByCasId = new Map();
  const reportByEventId = new Map();
  for (const span of cas.spans.sort((a, b) => a.begin - b.begin || a.end - b.end)) {
    const { begin, end } = span;
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end <= begin || end > cas.text.length) {
      throw new Error(`${path}: invalid span offsets for CAS annotation ${span["%ID"]}`);
    }
    const report = reports.find((item) => begin >= item.sourceStart && end <= item.sourceEnd);
    if (!report) throw new Error(`${path}: span ${span["%ID"]} crosses a report separator or falls outside report text`);
    const event = {
      id: `${report.id}_e${report.events.length + 1}`,
      reportId: report.id,
      start: begin - report.sourceStart,
      end: end - report.sourceStart,
      surface: report.text.slice(begin - report.sourceStart, end - report.sourceStart),
      type: annotationType(span),
      attributes: annotationAttributes(span),
    };
    spanByCasId.set(String(span["%ID"]), event.id);
    reportByEventId.set(event.id, report);
    report.events.push(event);
  }

  const events = reports.flatMap((report) => report.events);
  const parent = new Map(events.map((event) => [event.id, event.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  const temporalRelations = [];
  for (const relation of cas.relations) {
    const link = relation.temporal_links;
    if (typeof link !== "string" || !link.startsWith("TLINK_")) continue;
    const source = spanByCasId.get(String(relation["@Governor"]));
    const target = spanByCasId.get(String(relation["@Dependent"]));
    if (!source || !target) {
      throw new Error(`${path}: relation ${relation["%ID"]} points to a missing span`);
    }
    if (link === "TLINK_identity") {
      union(source, target);
    } else {
      const sourceReport = reportByEventId.get(source);
      sourceReport.temporalRelations.push({
        id: `${sourceReport.id}_t${sourceReport.temporalRelations.length + 1}`,
        source,
        target,
        type: relationType(link),
      });
    }
  }

  const groups = new Map();
  for (const event of events) {
    const root = find(event.id);
    const group = groups.get(root) ?? [];
    group.push(event.id);
    groups.set(root, group);
  }
  const identityRelations = [...groups.values()]
    .filter((chain) => chain.length > 1)
    .map((chain, index) => ({ id: `${patientId}_c${index + 1}`, chain }));

  return {
    patientId,
    reports: reports.map(({ sourceStart, sourceEnd, ...report }) => report),
    identityRelations,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.inputs.length) throw new Error("Provide at least one INCEpTION CAS JSON file. Use --help for usage.");

  const config = options.config ? JSON.parse(readFileSync(options.config, "utf8")) : {};
  const patients = new Map();
  const reportIds = new Set();

  for (const input of options.inputs) {
    const metadata = config[basename(input)] ?? {};
    const { patientId, reports, identityRelations } = convertDocument(input, metadata);
    for (const report of reports) {
      if (reportIds.has(report.id)) throw new Error(`Duplicate report ID: ${report.id}`);
      reportIds.add(report.id);
    }
    const patient = patients.get(patientId) ?? { id: patientId, reports: [], identityRelations: [] };
    patient.reports.push(...reports);
    patient.identityRelations.push(...identityRelations);
    patients.set(patientId, patient);
  }

  const output = { patients: [...patients.values()] };
  const serialized = JSON.stringify(output, null, 2);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, serialized);
  const reports = output.patients.flatMap((patient) => patient.reports);
  console.log(`Wrote ${output.patients.length} patients, ${reports.length} reports, ${reports.reduce((sum, report) => sum + report.events.length, 0)} spans, and ${reports.reduce((sum, report) => sum + report.temporalRelations.length, 0)} temporal links to ${options.output}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}