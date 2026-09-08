# Existing deployment

- Frontend: https://smart-water-safety-web.vercel.app
- Backend: https://smart-water-safety-backend.onrender.com

The backend address was recovered from the existing public frontend bundle and its health endpoint checked. Do not use `YOUR_RENDER_URL`.

## Render

Update the existing service, keeping its current Supabase credentials server-side. The backend needs the repository's `shared`, `data`, and `frontend/public/data` directories as well as `backend`; leave Render's Root Directory blank. Build with `npm ci --prefix backend`; start with `npm start --prefix backend`. Set `NODE_ENV=production` and `CORS_ORIGINS=https://smart-water-safety-web.vercel.app`. Use the existing DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY secrets. Do not put the database password in a VITE variable.

Run `npm run migrate` once from the repository root. The migration is additive and repeatable: it uses `sws_` tables with RLS and does not reset the original week's tables. The connected database was already migrated during this build. The bundled public Supabase CA keeps certificate and hostname verification enabled.

Health should report `version: 1.0.0`, `storage: supabase`, `sites: 3`, `datasets: 64`, and `live_dispatch: false`. A different storage value means the demo is not using Supabase; check database credentials and migrations.

## Vercel

The root `vercel.json` supports a repository-root project. `frontend/vercel.json` supports the existing frontend-root layout; in that case enable inclusion of source files outside the Root Directory so shared modules are available. Prefer a blank Root Directory with the supplied root build/install settings.

Leave `VITE_API_URL` empty: `/api` rewrites to the verified Render backend, allowing operator cookies to stay on the frontend origin. Socket.IO connects directly to Render using `VITE_SOCKET_URL=https://smart-water-safety-backend.onrender.com`; Vercel is not used as a WebSocket server. Remove any stale API placeholder or old cross-origin override in project settings before rebuilding.

The deployment must include all public data files and the generated `sw.js`. SPA rewrites support direct links to Explore, Forecast, Emergency, Rescue and Data. The service worker precaches the shell, all page chunks, all three data bundles and original KMLs; its cache version changes when data or code changes.

## Operator access

Create the operator through Supabase Auth. An administrator can grant a role using the actual Auth user UUID:

```sql
INSERT INTO sws_operator_roles(user_id, role)
VALUES ('ACTUAL_AUTH_USER_UUID', 'rescue_team')
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
```

Allowed roles are `rescue_team` and `authority`. User-editable profile metadata cannot grant access. The public demo needs no password and never claims to be authenticated operational dispatch.

## Credential follow-up

The original Git history included environment files. The current version excludes them and installed dependencies. Rotate the previously committed database password in Supabase, then update Render and `backend/.env`. Existing Git history still needs appropriate cleanup if secrets were shared.
