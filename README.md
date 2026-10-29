# MedStories

MedStories is a conference demo for exploring clinical narratives and their NLP annotations across reports. It brings annotated events and temporal relations together in an interactive patient-centred interface.

This is a research prototype for demonstration and exploration, not a medical device or clinical decision-support system. Do not use it to make decisions about patient care.

## Run the conference demo

Docker Compose starts the published demo image:

```bash
docker compose up -d
```

Open [http://localhost:8070](http://localhost:8070). To stop the demo:

```bash
docker compose down
```

## Run from source

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

The app is a client-side React, TypeScript, and Vite application; it has no backend. When running from source, it loads the included `public/data/inception-dataset.json`. Set `VITE_DATASET_URL` in `.env.local` to select another data file under `public/`.

Before using any real clinical data, ensure you have the required approvals and that the data is appropriately de-identified. Do not publish identifiable patient information.

## Plugging in your data

1. Put your JSON in `public/data/` (e.g. `my-data.json`) and either
   - replace `inception-dataset.json`, or
   - create `.env.local` with `VITE_DATASET_URL=/data/my-data.json` (any URL works if CORS allows it).
2. If your layout differs, convert it in `adapt` (second argument of `loadDataset()` in `src/data/loader.ts`) instead of rewriting the app.


## Dataset format

The included dataset, `public/data/inception-dataset.json`, contains 5 patients, 22 clinical-note reports, and 932 events. Its top level is `{ "patients": [...] }` (a bare array of patients is also accepted). The JSON structure expected by the app is:

```jsonc
{
  "patients": [{
    "id": "P001",
    "reports": [{
      "id": "p1r1",                      // globally unique
      "patientId": "P001",               // must match the enclosing patient
      "title": "Discharge summary",
      "type": "clinical note",           // report type; distinct from event.type
      "date": "2019-05-15",              // optional ISO date
      "text": "registo: 15-05-2019; antecedentes.",
      "events": [
        {
          "id": "p1r1_e1",
          "reportId": "p1r1",
          "start": 0, "end": 7,
          "surface": "registo",
          "type": "General Event",
          "attributes": {
            "polarity": "POSITIVE",
            "Pos": "Noun"
          }
        },
        {
          "id": "p1r1_e2",
          "reportId": "p1r1",
          "start": 9, "end": 19,
          "surface": "15-05-2019",
          "type": "Time",
          "attributes": {
            "Time_Type": "Date",
            "TemporalFunction": "DOCTIME",
            "Value": "2019-05-15"
          }
        },
        {
          "id": "p1r1_e3",
          "reportId": "p1r1",
          "start": 21, "end": 33,
          "surface": "antecedentes",
          "type": "Specialized Event",
          "attributes": {
            "polarity": "POSITIVE",
            "specializedEventClass": "Personal History",
            "Pos": "Noun"
          }
        }
      ],
      "temporalRelations": [{
        "id": "p1r1_t1",
        "source": "p1r1_e1", "target": "p1r1_e2",
        "type": "IS_INCLUDED"
      }]
    }],
  }]
}
```

Notes:
- `report.type` describes the report (the included data uses `"clinical note"`). `event.type` is the original INCEpTION span label; the included data uses `General Event`, `Specialized Event`, and `Time`. Keep this label in `type` rather than converting it to categories such as `PROBLEM`, `TEST`, or `TREATMENT`.
- `attributes` is optional and contains annotation details such as `specializedEventClass`, polarity, and time values. The INCEpTION label is already stored in `event.type`; do not duplicate it as `inceptionLabel`.
- Event and relation types are open vocabularies; unknown event types get an automatic colour, and relation types are shown as-is (upper-cased).
- Temporal relation names in the included data include `IS_INCLUDED`, `SIMULTANEOUS`, `BEFORE`, and `AFTER`. The app accepts other non-empty relation types too.
- Overlapping or nested events are supported; the innermost span receives the click/colour.
- Offsets are JavaScript string indices (UTF-16 code units). Convert if your offsets are in bytes or code points.
- Each patient requires an `id` and `reports`. Each report requires `id`, `patientId`, `title`, `type`, `text`, and `events`; `date` is optional and `temporalRelations` defaults to an empty list. Patient-level `identityRelations` also defaults to an empty list. Each identity chain must contain at least two event IDs.

## Regenerating sample data

`npm run gen:sample` rebuilds `public/data/dataset.json` from inline-annotated text in `scripts/generate-sample.mjs` (offsets are computed, so they are always correct). To use this generated sample instead of the included INCEpTION dataset, set `VITE_DATASET_URL=/data/dataset.json` in `.env.local`.

## Converting INCEpTION CAS JSON

Convert one or more INCEpTION CAS JSON exports with:

```bash
npm run convert:inception -- annotations/555.json annotations/661.json
```

This writes `annotations/converted-dataset.json` by default. For a custom output or metadata config, invoke the script directly with Node, e.g. `node scripts/convert-inception.mjs annotations/555.json annotations/661.json --config annotations/metadata.json --out annotations/converted-dataset.json`.

Each input file becomes one patient. Its sofa text is split into reports at blank lines (two newline characters). The converter makes annotation offsets relative to each report, converts `custom.Relation` governor/dependent links, and groups `TLINK_identity` links into patient-level identity chains. Cross-report temporal links are stored with their Governor event's report. You can set report titles, types, dates, or IDs with a JSON config keyed by input filename:

```json
{
  "555.json": {
    "patientId": "P555",
    "reports": [
      { "title": "Initial note", "type": "progress note", "date": "2022-04-20" },
      { "title": "Discharge summary", "type": "discharge summary", "date": "2022-05-16" }
    ]
  }
}
```

The `reports` array is in the same order as the blank-line-separated sections; omitted entries receive generated metadata. The default output stays under `annotations/` so clinical text is not served by the app. To load it in the app, choose an output under `public/data/` and set `VITE_DATASET_URL` in `.env.local` to its public URL. Review and de-identify clinical data before placing it under `public/`.

## Demo features

| Route | View |
| --- | --- |
| `/` | Patient list (search, sortable) |
| `/patient/:id` | Report timeline, coreference chains, merged patient timeline, and statistics |
| `/patient/:id/report/:rid` | Annotated report text, event details, and temporal graph |
| `/patterns` | Patterns across the dataset |
| `/words` | Word graph |

- Header: global search by surface text, event type, relation type, "cross-report coref only"; results link straight to the event. The same filters dim non-matching events in text and filter the patient list.
- Report view: click or hover events (hover highlights related events with dashed outlines), type legend toggles, optional temporal arrows (all, or only those of the selected event).
- Keyboard: arrow keys move between events, Esc clears selection.
- Selection lives in the URL. Following a link to another report pushes a history entry; header back/forward buttons and the breadcrumb navigate it.
- Light/dark mode (persisted).

## Layout

```
src/
  data/        schema.ts (zod + validation), loader.ts (loadDataset + indexes), DataContext.tsx
  lib/         colors.ts, util.ts, graphLayout.ts (timeline-lane layout)
  components/  TextWithSpans, EventPanel, TemporalGraph, GraphCanvas, CorefView, PatientTimeline, StatsPanel, Layout, ui
  pages/       PatientList, PatientPage, ReportView
scripts/       generate-sample.mjs
public/data/   dataset.json
```
