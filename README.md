# Smart Water Safety

SIH 2026 prototype for Calangute Beach, Muthathi River and Dudhsagar Falls. Built on the original React/Vite, MapLibre, Express and Supabase/PostGIS project, with the existing Vercel frontend and Render backend.

## Run locally

Use Node.js 22.12+ (or Node 24). From the repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

Open http://127.0.0.1:5173. Existing local `.env` files are preserved. For a new checkout, copy `backend/.env.example` to `backend/.env` and supply the server-side Supabase values. Without a database, the demo runs using local server storage, with a browser fallback when the API is unavailable.

```sh
npm run migrate
npm test
npm run lint
npm run build
```

To check component rendering without a browser, run `node scripts/render-check.mjs` from `frontend`. To verify imported database counts, geometry validity and row-level protection, run `node scripts/verify-database.js` from `backend`.

## What works

- **Explore:** all three original KML maps, mapped pedestrian paths, GPS playback, route selection, location permission, consented trip recording, and offline site downloads.
- **Forecast:** site-specific metrics, history, now/3-hour/24-hour replay horizons, scenario controls, transparent risk rules, tide references, and on-demand Open-Meteo weather/marine forecasts.
- **Emergency:** user-started low/medium/high drills, a persistent 30-second SOS timer, cancellation, optional spoken guidance, offline queues, planning routes, zone messages and an explicit 112 dialler link.
- **Rescue:** isolated demo sessions, real-time Socket.IO updates, same-site team assignment, on-scene/resolution actions, audit export, zone occupancy, crowd layers, bounded last-seen search envelopes, and a reviewed route-contribution workflow.
- **Data:** 64 original datasets with hashes, sample/full-record inspection, provenance, correction notes, references and byte-identical KML downloads.
- **Operators:** server-validated Supabase password login with administrator-assigned roles. Operational data is separate from demonstration activity.

## Data integrity

All supplied files are archived under `data/source`. All three original KMLs remain byte-for-byte unchanged. Browser layers are derived separately. The archive includes the synthetic rasters and unused rough event feeds; retaining them does not make them observations or activate them as sensors.

See [data notes](docs/DATA_QUALITY.md), [deployment instructions](docs/DEPLOYMENT.md), and the [five-minute demo](docs/DEMO.md).

The reproducible import is `python scripts/prepare-data.py` (Python 3 with Pillow). It reads the original Downloads folder when available and otherwise the archived originals. Audited topology repairs are saved separately and checked against their original geometry before reuse.

## Operational scope

This is a working, integrated hackathon prototype. Synthetic GPS, rainfall events, risk thresholds, crowd counts, rescue teams and SOS drills are labelled throughout. Current weather is a numerical model, not a local water sensor. Missing gauges stay missing. Paths and refuges require field verification.

Official dispatch, SMS/push delivery, rescue-team video transport, a calibrated hydrological model, satellite DEM ingestion and native mobile background location are not connected. The 112 link opens the device dialler; drills do not contact emergency services. Operator sessions currently require sign-in again after a backend restart.

The original repository tracked local environment files. They have been removed from the current Git index, but earlier commits still contain them. Rotate the old database password in Supabase and update the local/Render secret values; `.gitignore` does not erase history.
