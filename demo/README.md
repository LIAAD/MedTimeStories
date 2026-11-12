# MedTimeStories Demo

This directory contains the MedTimeStories web application.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and production build
```

The development server loads the bundled dataset from `public/data/`. To use
another dataset under `public/`, set `VITE_DATASET_URL`.

## Dataset conversion

To convert INCEpTION CAS JSON files for local development:

```bash
npm run convert:inception -- inception/lma_555.json inception/lma_560.json
```

The converter writes the application dataset under `inception/converted/`.

## Structure

```text
demo/
├── public/data/    Bundled datasets
├── scripts/         Conversion scripts
├── src/             React application
├── Dockerfile       Production image
├── compose.yaml     Local container configuration
└── package.json     Frontend scripts and dependencies
```
