# Version 2 — connected tourist and rescue workspaces

The homepage now requires a role-specific entry. Tourist pages expose only the visitor's own incidents and the assigned team's limited location/ETA. Admins get incident management, consenting visitors, the synthetic replay, route review, and source records. API authorization enforces these boundaries; replay and catalog contents are no longer public static assets.

For a two-device demonstration, enter **Connected demo**, create either role, and copy the 16-character drill code. Enter the other role in another tab/device using that code. Send Help/SOS as the tourist, accept as admin, update the assigned team's position, mark on scene, then complete rescue. Both screens poll the shared durable workspace every three seconds. A failed request is not presented as delivered. Stable event IDs prevent duplicate SOS submissions.

Account sign-in uses existing Supabase credentials. Admin access requires `authority` or `rescue_team` in the server-controlled operator role table/app metadata. Tourist profile name and age use Supabase user metadata. Real account workspaces never share data with drill rooms. Real workspaces start with no fabricated rescue team; an admin registers actual project teams. This is project-console coordination, **not official emergency dispatch**. Account sessions expire after one hour or backend restart; drill sessions expire after 24 hours.

## Maps and algorithms

- MapLibre terrain uses [Mapzen terrain tiles](https://registry.opendata.aws/terrain-tiles/), a regional DEM compiled from SRTM and other sources. Terrain is exaggerated 1.5× and can be switched to 2D. Three downloaded 33×33 grids provide route elevation profiles; sampling/resampling does not improve underlying spatial accuracy.
- Dijkstra routes target a selected mapped point. Graph attachment now splits the selected edge, fixing false detours between positions on the same segment. Hazard intersection exclusion and crowd/moderate-risk costs remain active. Distinct alternatives are shown only when the mapped graph supports them.
- Green, blue and purple distinguish navigable planning alternatives; **red diagnostic lines are blocked connections, not recommended routes**. Original KML bytes are unchanged.
- Dudhsagar's broad catchment polygon HZ-02 is retained as catchment context rather than an asserted observed inundation extent. The specific water/hazard polygons remain excluded from route planning. Existing KML has genuine hazard crossings and disconnected destinations; the software cannot establish a safe evacuation path where evidence is missing.
- Zone outlook combines each mapped area's exposure with site-specific rainfall, wave/current or level-rise drivers. It identifies lower, moderate, dangerous and increasing modeled risk. It is transparent and time-dependent, but has not been calibrated against field outcomes.
- Missing gauge/temperature fields have separate generated `simulation_metrics`; original unknown observations remain null. Model weather does not use these substitutes. Generated values are explicitly marked in dataset replay.
- Last-seen locations and bounded uncertainty envelopes remain admin-only. A stale timestamp does not establish that a device was switched off. Actual positions require visitor consent; mock identities and replay tracks are labelled simulated.

LoRa radios and gateways are future hardware integration. No software-only mesh or offline dispatch capability is claimed.

## Reproduce and verify

1. `python scripts/prepare-data.py` preserves originals and separates private replay/catalog data.
2. `node scripts/upgrade-data.mjs` applies version 2 derived interpretations and separate estimated metrics.
3. `python scripts/fetch-elevation.py` retrieves public regional terrain.
4. `npm run migrate --prefix backend` updates additive site/data tables. The backend initializes the RLS-protected `sws_operations` document table for shared rooms.
5. `npm test --prefix backend`, `npm test --prefix frontend`, `npm run lint --prefix frontend`, `npm run build --prefix frontend`.

Coverage includes cross-session SOS lifecycle, role restrictions, visitor ownership, duplicate event delivery, isolated drills, destination routing, terrain coverage, spatial trends, source hashes, hazard geometry and page rendering. No claim of 100% real-world safety accuracy is made.
