# Clinical NLP Explorer

Single-page demo (React + Vite + TypeScript + Tailwind v4, no backend) for exploring clinical NLP annotations: events, temporal relations and cross-report coreference.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Sample data (3 synthetic patients, 8 reports, 140 events) ships in `public/data/dataset.json`.

## Run with Docker Compose

Build and start the production app:

```bash
docker compose up --build
```

Open `http://localhost:8080`. Stop the app with `Ctrl+C`, or run `docker compose down`.

The default dataset is `/data/inception-dataset.json`. To select a different JSON file under `public/data/`, set `VITE_DATASET_URL` in the environment or in a root `.env` file before building:

```bash
VITE_DATASET_URL=/data/dataset.json docker compose up --build
```

## Plugging in your data

1. Put your JSON in `public/data/` (e.g. `my-data.json`) and either
   - replace `dataset.json`, or
   - create `.env.local` with `VITE_DATASET_URL=/data/my-data.json` (any URL works if CORS allows it).
2. If your layout differs, convert it in `adapt` (second argument of `loadDataset()` in `src/data/loader.ts`) instead of rewriting the app.
3. Open the app. Validation errors are listed in the UI with the JSON path, e.g.
   `patients[0].reports[1].events[3].surface: event "x" in report "y": offsets [10, 15) select "pain " but surface is "pain"`.

## Expected JSON

Top level is `{ "patients": [...] }` (a bare array of patients is also accepted).

```jsonc
{
  "patients": [{
    "id": "P001",
    "reports": [{
      "id": "p1r1",                      // globally unique
      "patientId": "P001",               // must match the enclosing patient
      "title": "Discharge summary",
      "type": "discharge summary",
      "date": "2025-03-06",              // optional ISO date (document creation time)
      "text": "Admitted with chest pain ...",
      "events": [{
        "id": "p1r1_e1",                 // globally unique
        "reportId": "p1r1",
        "start": 14, "end": 24,          // [start, end) character offsets into `text`
        "surface": "chest pain",         // must equal text.slice(start, end)
        "type": "PROBLEM",               // PROBLEM | TREATMENT | TEST | OCCURRENCE | any string
        "attributes": { "polarity": "NEGATED", "modality": "HYPOTHETICAL" }  // optional
      }],
      "temporalRelations": [{
        "id": "p1r1_t1",
        "source": "p1r1_e1", "target": "p1r1_e2",   // event ids of the same patient
        "type": "BEFORE"                 // BEFORE | AFTER | OVERLAP | CONTAINS | BEGINS-ON | ENDS-ON | SIMULTANEOUS | any string
      }]
    }],
    "identityRelations": [               // patient level: chains may span reports
      { "id": "P001_c1", "chain": ["p1r1_e1", "p1r2_e1"] }
    ]
  }]
}
```

Notes:
- Unknown event types get an automatic colour; unknown relation types are shown as-is (upper-cased).
- Relation types `BEFORE`/`AFTER` drive the left-to-right order in graphs; other types place nodes next to their neighbours.
- Overlapping or nested events are supported; the innermost span receives the click/colour.
- Offsets are JavaScript string indices (UTF-16 code units). Convert if your offsets are in bytes or code points.

## Regenerating the sample data

`npm run gen:sample` rebuilds `public/data/dataset.json` from inline-annotated text in `scripts/generate-sample.mjs` (offsets are computed, so they are always correct).

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

## Features / navigation

| Route | View |
| --- | --- |
| `/` | Patient list (search, sortable) |
| `/patient/:id?tab=reports\|coref\|timeline` | Report timeline, coreference chains, merged patient timeline, stats |
| `/patient/:id/report/:rid?event=:eid&tab=graph` | Report text with highlights, event panel, temporal graph |

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
# med2story
