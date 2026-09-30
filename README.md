# Routes and Safety Map

This map-focused prototype covers Calangute Beach, Muthathi River, and Dudhsagar Falls. It combines a React/Vite frontend with an Express realtime API and optional PostgreSQL persistence.

## Local development

Use Node.js 22.12 or newer. From the repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

Open <http://127.0.0.1:5173>. The API runs on <http://127.0.0.1:5000>.

The demonstration works without a database by using local server storage and a browser fallback. For database-backed operator features, copy `backend/.env.example` to `backend/.env`, add the required values, and run:

```sh
npm run migrate
```

## Quality checks

```sh
npm test
npm run lint
npm run build
```

- `npm test` renders every page, site, and scenario combination.
- `npm run lint` checks the frontend source.
- `npm run build` creates the production frontend and offline service worker.

## Project structure

- `frontend/` — React interface, maps, offline data, and public assets.
- `backend/` — API, authentication, operational workflow, and database migration.
- `shared/` — deterministic risk, navigation, consensus, and demo-state rules used by both applications.
- `data/normalized/` — prepared datasets served by the backend data register.
- `scripts/dev.mjs` — starts the frontend and backend development servers together.

## Deployment

- `vercel.json` builds and serves the frontend from the repository root.
- `render.yaml` configures the backend service.
- Backend production secrets belong in the hosting environment, never in the repository.

## Safety scope

This is a demonstration system. Synthetic conditions, risk thresholds, crowd counts, rescue teams, and SOS drills are labelled in the interface. Current weather comes from a numerical model, not a local sensor. Routes and refuges require field verification.

The project does not connect to official dispatch, SMS/push delivery, calibrated hydrological models, or native background location. The 112 action opens the device dialler; drills do not contact emergency services.
