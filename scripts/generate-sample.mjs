// Generates public/data/dataset.json from inline-annotated text so that offsets are always exact.
// Markup: [e1:TYPE]surface[/]  or  [e1:TYPE:flag]surface[/]  (flags: neg | hypo | hist)
import { mkdirSync, writeFileSync } from "node:fs";

const FLAGS = {
  neg: { polarity: "NEGATED" },
  hypo: { modality: "HYPOTHETICAL" },
  hist: { modality: "HISTORICAL" },
};

const patients = [
  {
    id: "P001",
    reports: [
      {
        id: "p1r1",
        title: "Emergency department note",
        type: "progress note",
        date: "2025-03-02",
        markup:
          "58-year-old male presented to the ED with [e1:PROBLEM]chest pain[/] radiating to the left arm, associated with [e2:PROBLEM]shortness of breath[/] and [e3:PROBLEM]diaphoresis[/]. Denies [e4:PROBLEM:neg]nausea[/]. An [e5:TEST]ECG[/] showed [e6:PROBLEM]ST elevation[/] in the anterior leads. [e7:TEST]Troponin[/] was [e8:OCCURRENCE]elevated[/] at 4.2. He was given [e9:TREATMENT]aspirin[/] and [e10:TREATMENT]heparin[/] and taken for [e11:TREATMENT]emergent cardiac catheterization[/], which revealed [e12:PROBLEM]95% LAD occlusion[/]. A [e13:TREATMENT]drug-eluting stent[/] was [e14:OCCURRENCE]placed[/]. History of [e15:PROBLEM:hist]hypertension[/]. Plan: [e16:OCCURRENCE]admit[/] to CCU for [e17:OCCURRENCE]monitoring[/].",
        rels: [
          "e15 BEFORE e1", "e1 OVERLAP e2", "e1 OVERLAP e3", "e1 BEFORE e5", "e5 CONTAINS e6", "e5 BEFORE e7",
          "e7 OVERLAP e8", "e8 BEFORE e9", "e9 SIMULTANEOUS e10", "e10 BEFORE e11", "e11 CONTAINS e12",
          "e11 CONTAINS e13", "e13 OVERLAP e14", "e12 BEFORE e14", "e11 BEFORE e16", "e16 BEGINS-ON e17",
        ],
      },
      {
        id: "p1r2",
        title: "Discharge summary",
        type: "discharge summary",
        date: "2025-03-06",
        markup:
          "Admitted on 03/02 with [e1:PROBLEM]chest discomfort[/] and diagnosed with [e2:PROBLEM]anterior STEMI[/]. Underwent [e3:TREATMENT]PCI[/] with [e4:TREATMENT]stent placement[/] to the LAD. Hospital course was complicated by [e5:PROBLEM]atrial fibrillation[/] on day 2, treated with [e6:TREATMENT]metoprolol[/]. [e7:TEST]Echocardiogram[/] showed [e8:PROBLEM]reduced ejection fraction[/] of 40%. No further [e9:PROBLEM:neg]chest pain[/]. Patient was started on [e10:TREATMENT]atorvastatin[/], [e11:TREATMENT]clopidogrel[/], and [e12:TREATMENT]lisinopril[/] for [e13:PROBLEM]hypertension[/]. He was [e14:OCCURRENCE]discharged[/] home in stable condition with [e15:OCCURRENCE]follow-up[/] in cardiology clinic in 2 weeks. [e16:PROBLEM:hypo]Recurrent ischemia[/] should prompt return.",
        rels: [
          "e1 OVERLAP e2", "e2 BEFORE e3", "e3 CONTAINS e4", "e4 BEFORE e5", "e5 BEFORE e6", "e4 BEFORE e7",
          "e7 OVERLAP e8", "e4 BEFORE e9", "e4 BEFORE e10", "e10 SIMULTANEOUS e11", "e11 SIMULTANEOUS e12",
          "e12 OVERLAP e13", "e10 BEFORE e14", "e14 BEFORE e15", "e14 BEFORE e16",
        ],
      },
      {
        id: "p1r3",
        title: "Cardiology clinic follow-up",
        type: "progress note",
        date: "2025-03-20",
        markup:
          "Seen in clinic for [e1:OCCURRENCE]follow-up[/] after [e2:PROBLEM]STEMI[/] treated with [e3:TREATMENT]stent[/] on 03/02. Reports no [e4:PROBLEM:neg]chest pain[/] but mild [e5:PROBLEM]fatigue[/]. Continues [e6:TREATMENT]atorvastatin[/] and [e7:TREATMENT]clopidogrel[/]. [e8:TREATMENT]Metoprolol[/] was [e9:OCCURRENCE]stopped[/] after [e10:PROBLEM]atrial fibrillation[/] [e11:OCCURRENCE]resolved[/]. Repeat [e12:TEST]echocardiogram[/] shows [e13:PROBLEM]improved ejection fraction[/] of 50%. [e14:PROBLEM]Hypertension[/] is [e15:OCCURRENCE]well controlled[/] on [e16:TREATMENT]lisinopril[/]. Plan to [e17:OCCURRENCE]enroll[/] in [e18:TREATMENT]cardiac rehabilitation[/].",
        rels: [
          "e2 BEFORE e1", "e3 BEFORE e1", "e1 OVERLAP e4", "e1 OVERLAP e5", "e6 OVERLAP e1", "e7 OVERLAP e1",
          "e2 BEFORE e10", "e10 BEFORE e11", "e11 BEFORE e9", "e8 BEFORE e9", "e3 BEFORE e12", "e12 BEFORE e13",
          "e14 OVERLAP e15", "e15 OVERLAP e16", "e1 BEFORE e17", "e17 BEFORE e18",
        ],
      },
    ],
    chains: [
      ["p1r1_e1", "p1r2_e1", "p1r2_e9", "p1r3_e4"],
      ["p1r1_e6", "p1r2_e2", "p1r3_e2"],
      ["p1r1_e11", "p1r2_e3"],
      ["p1r1_e13", "p1r2_e4", "p1r3_e3"],
      ["p1r1_e15", "p1r2_e13", "p1r3_e14"],
      ["p1r2_e5", "p1r3_e10"],
      ["p1r2_e6", "p1r3_e8"],
      ["p1r2_e10", "p1r3_e6"],
      ["p1r2_e11", "p1r3_e7"],
      ["p1r2_e12", "p1r3_e16"],
      ["p1r2_e7", "p1r3_e12"],
      ["p1r2_e8", "p1r3_e13"],
      ["p1r2_e15", "p1r3_e1"],
    ],
  },
  {
    id: "P002",
    reports: [
      {
        id: "p2r1",
        title: "Admission note",
        type: "progress note",
        date: "2025-01-09",
        markup:
          "72-year-old female with [e1:PROBLEM]COPD[/] presented with three days of [e2:PROBLEM]productive cough[/], [e3:PROBLEM]fever[/] and worsening [e4:PROBLEM]dyspnea[/]. She is a [e5:PROBLEM:hist]former smoker[/]. On exam, [e6:PROBLEM]crackles[/] at the right base. [e7:TEST]Chest X-ray[/] showed [e8:PROBLEM]right lower lobe pneumonia[/]. [e9:TEST]Blood cultures[/] were [e10:OCCURRENCE]drawn[/] and she was started on [e11:TREATMENT]ceftriaxone[/] and [e12:TREATMENT]azithromycin[/]. [e13:TREATMENT]Albuterol nebulizers[/] were given for [e14:PROBLEM]wheezing[/]. [e15:TREATMENT]Supplemental oxygen[/] was [e16:OCCURRENCE]initiated[/] for [e17:PROBLEM]hypoxia[/]. She will be [e18:OCCURRENCE]admitted[/] to the medical floor.",
        rels: [
          "e1 BEFORE e2", "e2 OVERLAP e3", "e3 OVERLAP e4", "e2 BEFORE e7", "e7 OVERLAP e8", "e7 BEFORE e9",
          "e9 OVERLAP e10", "e10 BEFORE e11", "e11 SIMULTANEOUS e12", "e14 BEFORE e13", "e17 BEFORE e15",
          "e15 BEGINS-ON e16", "e12 BEFORE e18", "e11 BEFORE e18",
        ],
      },
      {
        id: "p2r2",
        title: "Chest X-ray report",
        type: "radiology",
        date: "2025-01-10",
        markup:
          "CHEST X-RAY. INDICATION: [e1:PROBLEM]pneumonia[/] in a patient with [e2:PROBLEM]COPD[/]. FINDINGS: [e3:PROBLEM]Consolidation[/] in the right lower lobe, consistent with [e4:PROBLEM]pneumonia[/]. Small [e5:PROBLEM]pleural effusion[/]. [e6:PROBLEM:neg]Pneumothorax[/] is absent. No [e7:PROBLEM:neg]pulmonary edema[/]. [e8:PROBLEM]Hyperinflation[/] and [e9:PROBLEM]emphysema[/] are noted. A [e10:TREATMENT]nasal cannula[/] is in place. Compared with the [e11:TEST]prior study[/], the [e12:PROBLEM]opacity[/] has [e13:OCCURRENCE]progressed[/]. IMPRESSION: [e14:OCCURRENCE]Recommend[/] [e15:TEST]follow-up radiograph[/] in six weeks to confirm [e16:OCCURRENCE]resolution[/].",
        rels: [
          "e2 BEFORE e1", "e3 OVERLAP e4", "e3 OVERLAP e5", "e8 OVERLAP e9", "e11 BEFORE e13", "e13 OVERLAP e12",
          "e14 BEFORE e15", "e15 BEFORE e16", "e10 OVERLAP e3",
        ],
      },
    ],
    chains: [
      ["p2r1_e8", "p2r2_e1", "p2r2_e3", "p2r2_e4"],
      ["p2r1_e1", "p2r2_e2"],
      ["p2r1_e15", "p2r2_e10"],
      ["p2r1_e7", "p2r2_e11"],
    ],
  },
  {
    id: "P003",
    reports: [
      {
        id: "p3r1",
        title: "Primary care visit",
        type: "progress note",
        date: "2024-11-05",
        markup:
          "54-year-old male with [e1:PROBLEM]type 2 diabetes[/] presents with [e2:PROBLEM]polyuria[/] and [e3:PROBLEM]blurred vision[/] for two weeks. [e4:TEST]HbA1c[/] was [e5:OCCURRENCE]elevated[/] at 9.4%. [e6:TEST]Creatinine[/] [e7:OCCURRENCE]rose[/] to 1.8, concerning for [e8:PROBLEM]diabetic nephropathy[/]. Denies [e9:PROBLEM:neg]chest pain[/]. He has been taking [e10:TREATMENT]metformin[/] but admits to poor [e11:OCCURRENCE]adherence[/]. [e12:TREATMENT]Insulin glargine[/] was [e13:OCCURRENCE]started[/] and [e14:TREATMENT]metformin[/] will be [e15:OCCURRENCE]held[/] due to [e16:PROBLEM]renal impairment[/]. [e17:TEST]Urine albumin[/] and [e18:TEST]renal ultrasound[/] are [e19:OCCURRENCE]ordered[/].",
        rels: [
          "e1 BEFORE e2", "e2 OVERLAP e3", "e4 OVERLAP e5", "e4 BEFORE e6", "e6 OVERLAP e7", "e7 OVERLAP e8",
          "e1 BEFORE e10", "e10 OVERLAP e11", "e10 BEFORE e13", "e11 BEFORE e13", "e12 BEGINS-ON e13",
          "e13 BEFORE e15", "e14 OVERLAP e15", "e16 OVERLAP e15", "e19 BEFORE e17", "e19 BEFORE e18",
        ],
      },
      {
        id: "p3r2",
        title: "Renal ultrasound report",
        type: "radiology",
        date: "2024-11-12",
        markup:
          "RENAL ULTRASOUND. INDICATION: [e1:PROBLEM]renal impairment[/] in a patient with [e2:PROBLEM]diabetes[/]. FINDINGS: Both kidneys are [e3:PROBLEM]echogenic[/] with [e4:PROBLEM]cortical thinning[/]. [e5:PROBLEM:neg]Hydronephrosis[/] is absent. A [e6:PROBLEM]simple cyst[/] is seen in the right kidney. [e7:PROBLEM:neg]Renal artery stenosis[/] cannot be [e8:OCCURRENCE]excluded[/] without [e9:TEST]Doppler[/]. IMPRESSION: Findings consistent with [e10:PROBLEM]chronic kidney disease[/], likely from [e11:PROBLEM]diabetic nephropathy[/]. [e12:OCCURRENCE]Recommend[/] [e13:OCCURRENCE]nephrology referral[/] and [e14:TEST]repeat ultrasound[/] with [e15:TEST]eGFR monitoring[/].",
        rels: [
          "e2 BEFORE e1", "e1 OVERLAP e3", "e3 OVERLAP e4", "e3 OVERLAP e6", "e9 BEFORE e8", "e7 OVERLAP e8",
          "e11 BEFORE e10", "e10 OVERLAP e3", "e12 BEFORE e13", "e13 BEFORE e14", "e14 SIMULTANEOUS e15",
        ],
      },
      {
        id: "p3r3",
        title: "Discharge summary",
        type: "discharge summary",
        date: "2024-12-20",
        markup:
          "Admitted for [e1:PROBLEM]diabetic ketoacidosis[/] triggered by a [e2:PROBLEM]urinary tract infection[/]. Initial [e3:TEST]glucose[/] was [e4:OCCURRENCE]elevated[/] at 520 with [e5:PROBLEM]anion gap acidosis[/]. Treated with [e6:TREATMENT]insulin infusion[/] and [e7:TREATMENT]IV fluids[/]; [e8:TREATMENT]ceftriaxone[/] was [e9:OCCURRENCE]given[/] for the [e10:PROBLEM]UTI[/]. [e11:PROBLEM]Acute kidney injury[/] on background [e12:PROBLEM]chronic kidney disease[/] [e13:OCCURRENCE]improved[/] with hydration. [e14:TEST]Blood glucose[/] [e15:OCCURRENCE]normalized[/] and he was [e16:OCCURRENCE]transitioned[/] to [e17:TREATMENT]insulin glargine[/]. [e18:TREATMENT]Metformin[/] remains [e19:OCCURRENCE]discontinued[/]. [e20:OCCURRENCE]Discharged[/] with [e21:OCCURRENCE]nephrology follow-up[/].",
        rels: [
          "e2 BEFORE e1", "e3 OVERLAP e4", "e4 OVERLAP e5", "e1 OVERLAP e5", "e7 BEFORE e13", "e8 OVERLAP e9",
          "e8 OVERLAP e10", "e12 BEFORE e11", "e6 BEFORE e14", "e14 OVERLAP e15", "e15 BEFORE e16",
          "e16 BEGINS-ON e17", "e15 BEFORE e20", "e18 OVERLAP e19", "e20 BEFORE e21",
        ],
      },
    ],
    chains: [
      ["p3r1_e1", "p3r2_e2"],
      ["p3r1_e8", "p3r2_e11"],
      ["p3r1_e16", "p3r2_e1", "p3r3_e11"],
      ["p3r2_e10", "p3r3_e12"],
      ["p3r1_e10", "p3r1_e14", "p3r3_e18"],
      ["p3r1_e12", "p3r3_e17"],
      ["p3r1_e15", "p3r3_e19"],
      ["p3r3_e2", "p3r3_e10"],
    ],
  },
];

function parseMarkup(markup) {
  const re = /\[(e\d+):([A-Z]+)(?::(\w+))?\]([^\[]*?)\[\/\]/g;
  let text = "";
  let last = 0;
  const events = [];
  let m;
  while ((m = re.exec(markup))) {
    text += markup.slice(last, m.index);
    const start = text.length;
    text += m[4];
    events.push({ local: m[1], type: m[2], flag: m[3], start, end: text.length, surface: m[4] });
    last = re.lastIndex;
  }
  text += markup.slice(last);
  return { text, events };
}

const out = {
  patients: patients.map((p) => ({
    id: p.id,
    reports: p.reports.map((r) => {
      const { text, events } = parseMarkup(r.markup);
      const gid = (local) => `${r.id}_${local}`;
      const ids = new Set(events.map((e) => e.local));
      return {
        id: r.id,
        patientId: p.id,
        title: r.title,
        type: r.type,
        date: r.date,
        text,
        events: events.map((e) => ({
          id: gid(e.local),
          reportId: r.id,
          start: e.start,
          end: e.end,
          surface: e.surface,
          type: e.type,
          attributes: {
            ...(e.type === "PROBLEM" ? { polarity: "POSITIVE", modality: "FACTUAL" } : {}),
            ...(e.flag ? FLAGS[e.flag] : {}),
          },
        })),
        temporalRelations: r.rels.map((s, i) => {
          const [a, type, b] = s.split(" ");
          if (!ids.has(a) || !ids.has(b)) throw new Error(`Bad relation "${s}" in ${r.id}`);
          return { id: `${r.id}_t${i + 1}`, source: gid(a), target: gid(b), type };
        }),
      };
    }),
    identityRelations: p.chains.map((chain, i) => ({ id: `${p.id}_c${i + 1}`, chain })),
  })),
};

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/dataset.json", JSON.stringify(out, null, 2));
const n = out.patients.flatMap((p) => p.reports);
console.log(`Wrote ${out.patients.length} patients, ${n.length} reports, ${n.reduce((a, r) => a + r.events.length, 0)} events`);
