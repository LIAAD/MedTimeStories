# MedTime Stories

MedTime Stories is a conference demo for exploring clinical narratives and their NLP annotations across reports. It brings annotated events and temporal relations together in an interactive patient-centred interface.

This is a research prototype for demonstration and exploration, not a medical device or clinical decision-support system. Do not use it to make decisions about patient care.

## Run with Docker

Place one or more INCEpTION CAS JSON exports in `inception/` (and optionally a `metadata.json` config; see [Converting INCEpTION CAS JSON](#converting-inception-cas-json)). Then start the app:

```bash
docker compose up --build -d
```

Docker converts the files in the mounted `inception/` directory each time the container starts and serves the result. The directory is mounted read-only; the generated dataset is stored inside the container. To switch or update the CAS files, replace them in `inception/` and restart the service:

```bash
docker compose restart medstories
```

Open [http://localhost:8071](http://localhost:8071). If `inception/` contains no CAS JSON files, the app uses the bundled dataset. To stop the app:

```bash
docker compose down
```

Input JSON files in `inception/` are excluded from Git. Treat the converted dataset as clinical data: ensure appropriate approvals and de-identification before making the app available to others.

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
- `report.textEn` and `event.surfaceEn` are optional English translations (see [English translations](#english-translations)). Offsets always refer to the original `text`; the translation is displayed separately and never annotated.

## English translations

Reports can show an English translation next to the original Portuguese text (toggle "English translation" in the report view; the event panel and tooltips also show translated event text). Translations are generated ahead of time with `scripts/translate.py`, which uses the [deep-translator](https://pypi.org/project/deep-translator/) package:

```bash
pip install deep-translator
node scripts/convert-inception.mjs inception/lma_005.json inception/lma_018.json --out inception/converted/converted-dataset.json
python scripts/translate.py inception/converted/converted-dataset.json --out inception/translations.json
docker compose restart medstories
```

The script writes `inception/translations.json`; on startup Docker merges it into the converted dataset automatically. (When running from source, pass `--translations inception/translations.json` to the converter.) Translations are keyed by a hash of the report text and by event surface, so re-running only translates new texts, and edited reports are never paired with a stale translation. Exclude `translations.json` from the CAS file list when running the converter manually (list your CAS files explicitly).

> **Privacy:** deep-translator sends the text to an online service (Google Translate by default). Only run it on data that is de-identified and approved for external services. Machine translation of clinical text can contain errors, so the interface labels it as machine translated.

## Regenerating sample data

`npm run gen:sample` rebuilds `public/data/dataset.json` from inline-annotated text in `scripts/generate-sample.mjs` (offsets are computed, so they are always correct). To use this generated sample instead of the included INCEpTION dataset, set `VITE_DATASET_URL=/data/dataset.json` in `.env.local`.

## Converting INCEpTION CAS JSON

Convert one or more INCEpTION CAS JSON exports with:

```bash
npm run convert:inception -- inception/lma_555.json inception/lma_560.json
```

This writes `inception/converted/converted-dataset.json` by default. For a custom output or metadata config, invoke the script directly with Node, e.g. `node scripts/convert-inception.mjs inception/lma_555.json inception/lma_560.json --config inception/metadata.json --out inception/converted/converted-dataset.json`.

Each input file becomes one patient. Its sofa text is split into reports at blank lines (two newline characters). The converter makes annotation offsets relative to each report, converts `custom.Relation` governor/dependent links, and groups `TLINK_identity` links into patient-level identity chains. Cross-report temporal links are stored with their Governor event's report. You can set report titles, types, dates, or IDs with a JSON config keyed by input filename. For Docker startup conversion, save this config as `inception/metadata.json` alongside the CAS files:

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

The `reports` array is in the same order as the blank-line-separated sections; omitted entries receive generated metadata. The default output stays under `inception/converted/` so clinical text is not served by the app. To load it in the app, choose an output under `public/data/` and set `VITE_DATASET_URL` in `.env.local` to its public URL. Review and de-identify clinical data before placing it under `public/`.

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
