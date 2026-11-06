# MedTimeStories
MedTimeStories is an end-to-end system for modelling and visualising the clinical timelines of patients with Acute Myeloid Leukaemia, based on the temporal annotations defined by the Med2Story Temporal Annotation Scheme (see "Annotation" Section of this Github).
The platform was developed in collaboration with haematologists to address the specific needs of this clinical setting.

**Drop in your INCEpTION exports, get an interactive patient-centred view of clinical narratives.**

MedTime Stories is a Docker image that takes INCEpTION CAS JSON files as input and serves a web app for exploring annotated clinical reports, their events, and the temporal and identity relations between them, within and across reports. No backend, database, or manual data preparation is needed.

This is a research prototype for demonstration and exploration, not a medical device or clinical decision-support system. Do not use it to make decisions about patient care.

## Demo

Watch the demonstration of our tool: https://drive.google.com/file/d/1qMVtoc8Bb-v3l20yHk-Yk4yBMx3xoF_O/view

Explore MedTimeStories: https://medtimestories.inesctec.pt/

## Quick start

1. Put your INCEpTION CAS JSON exports (one file per patient) in a folder, e.g. `inception/`.
2. Run the image with that folder mounted at `/inception`:

```bash
docker run --rm -p 8080:80 -v "$(pwd)/inception:/inception:ro" medstories
```

3. Open [http://localhost:8080](http://localhost:8080).

The files are converted when the container starts, so to load new or updated exports just replace them and restart the container. The input folder is mounted read-only and the converted data stays inside the container.

### With Docker Compose

From a clone of this repository, `compose.yaml` builds the image and mounts `./inception`:

```bash
docker compose up --build -d       # start
docker compose restart medstories  # reload after changing the files in inception/
docker compose down                # stop
```

If the input folder contains no CAS JSON files, the app starts with a bundled example dataset.

## What you get

- **Patient list** with search and sortable statistics.
- **Patient page** with the report timeline, relations that cross reports, a merged patient timeline, and statistics.
- **Annotated report view** with highlighted events, event details, optional relation arrows, and a zoomable temporal graph. Equivalent dates are merged into one node, and admission and discharge dates are marked.
- **Patterns** and **word graph** views across the whole dataset.
- Global search by text, event type, and relation type, with a "cross-report relations only" filter.
- Keyboard navigation, shareable URLs, and light/dark mode.

## Input

Each INCEpTION CAS JSON file becomes one patient. The text is split into reports at blank lines, and annotations (events, time expressions, and their attributes) and relation links (temporal links and identity links, including those that connect different reports) are converted automatically.

Optionally, add a `metadata.json` next to the CAS files to name reports and patients. It is keyed by input filename, and its `reports` array follows the order of the reports in the text:

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

Omitted entries receive generated titles.

## Data protection

Treat input files as clinical data. Make sure you have the required approvals and that the data is de-identified before running the image or sharing the running app. Input JSON files in `inception/` are excluded from Git.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

To convert files outside Docker:

```bash
npm run convert:inception -- inception/lma_555.json inception/lma_560.json
```

This writes `inception/converted/converted-dataset.json`; use `node scripts/convert-inception.mjs <files> --config inception/metadata.json --out public/data/inception-dataset.json` for a custom output. The dev server loads `public/data/inception-dataset.json`; set `VITE_DATASET_URL` in `.env.local` to use another file under `public/`.
