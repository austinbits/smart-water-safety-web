# Data quality and evidence

Prepared 8 September 2026. The application uses 3 sites, 281 mapped/derived features, 1,200 replay timeline samples and a 64-file source register. The source archive is immutable during processing; SHA-256 tests compare every file against the manifest.

| Site      | Finding                                                                                          | Treatment                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Calangute | The beach KML contains a waterfall-area polygon.                                                 | Select Polygon 2 for the beach display. Preserve the complete original KML.                                                                                                    |
| Calangute | Tourist and rescue GPS coordinates were around Dudhsagar.                                        | Regenerate 29,922 clearly synthetic, anonymized GPS records along mapped beach paths, retaining the source timestamps and raw archive. These are not recovered real positions. |
| Calangute | Some crowd locations and rip-current labels are outside the beach.                               | Relocate only the displayed synthetic crowd baseline to mapped paths; retain raw rip-current labels for inspection, without treating them as local truth.                      |
| Calangute | Wind is transcribed in knots; tides are unverified chart entries.                                | Convert knots to km/h by 1.852. Preserve tide datum uncertainty and source times. Model sea level above MSL is displayed separately.                                           |
| Muthathi  | Reservoir/reference readings do not establish local river stage or flow.                         | Keep local water-level and flow values null. Do not substitute reservoir elevation or discharge.                                                                               |
| Muthathi  | Synthetic elevation near 690 m conflicts with mapped higher-ground points around 428–433 m.      | Exclude the grid from route safety costs pending an authoritative DEM.                                                                                                         |
| Muthathi  | Two rough restricted-zone polygons self-intersect.                                               | Use PostGIS ST_MakeValid in derived layers only. Store the original and repaired geometry with the reason in `data/normalized/geometry-repairs.json`.                          |
| Dudhsagar | The former website used the wrong longitude.                                                     | Use the supplied KML study area near 74.3125° E, 15.3122° N.                                                                                                                   |
| Dudhsagar | A candidate evacuation route follows railway geometry; refuge candidates include a cave/station. | Exclude railway paths and cave/station destinations from pedestrian evacuation planning.                                                                                       |
| All       | Candidate zones, synthetic records and supplied historical claims can sound authoritative.       | Show provenance. Candidate refuges remain unverified; unknown values are never filled with plausible-looking readings.                                                         |

## Source checks

- Two Dudhsagar incident entries match page 4 of the [Goa Legislative Assembly annexure](https://static.goavidhansabha.gov.in/goalpub/docs/question_docs/file_d7736f87-cb0f-45ce-87e5-2dc1be1f1190.pdf). Their precise coordinates remain unverified. Other supplied incident references need individual checks.
- [NWIC's Goa hourly water-level dataset](https://www.nwdp.nwic.gov.in/dataset/river-water-level-telemetry-hourly-goa-department) exists. No station has been verified against this waterfall study reach.
- [Open-Meteo weather](https://open-meteo.com/en/docs) and [marine](https://open-meteo.com/en/docs/marine-weather-api) forecasts are fetched on demand with returned timestamps and units. Coarse coastal currents cannot validate a local rip-current warning; sea level above MSL is not a surveyed tide chart datum.
- [INCOIS ocean advisories](https://incois.gov.in/site/services/osf.jsp) and [India's 112 service](https://112.gov.in/) are official references. No operational feed or dispatch agreement is claimed.

## Modeling and route limits

Risk uses explicit, uncalibrated thresholds in `shared/engine.mjs`. Scenario overrides and polygon expansion illustrate behavior; they are not fitted flood forecasts. Dijkstra follows mapped pedestrian geometry, rejects high-risk crossings and excludes railway routes. Connections within 10 m are drafting-gap joins. Start/destination gaps up to 80 m are reported separately and never drawn as verified off-path navigation. Unknown connectivity produces no route.

Community proposals require three distinct reviewed traces with at least 70% of their sampled points within 20 m of an existing path. Duplicate geometry counts once. This is usage evidence, not independent-user authentication, full-path coverage, terrain validation or safety certification. Local role assignment cannot authorize field deployment.

The lost-signal envelope is bounded uncertainty based on last-seen movement, elapsed time and GPS accuracy, not an exact predicted position. Browser offline support requires one successful online load and available storage; it does not bulk-cache street tiles or guarantee background delivery when the app is closed.
