require("dotenv").config({ quiet: true });
const { createPool } = require("../src/config/database");
const { sites, manifest } = require("../src/data");
const assert = require("node:assert/strict");
(async () => {
  const pool = createPool();
  if (!pool) throw new Error("DATABASE_URL required.");
  try {
    const result =
      await pool.query(`SELECT (SELECT count(*)::int FROM sws_sites) sites,
   (SELECT count(*)::int FROM sws_features) features,
   (SELECT count(*)::int FROM sws_forecast_samples) samples,
   (SELECT count(*)::int FROM sws_dataset_catalog) datasets,
   (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'sws_%' AND rowsecurity) protected_tables,
   (SELECT count(*)::int FROM sws_features WHERE NOT ST_IsValid(geom)) invalid_geometry`);
    const counts = result.rows[0];
    console.log("Imported counts:", JSON.stringify(counts));
    assert.equal(counts.sites, 3);
    assert.equal(counts.datasets, manifest.files.length);
    if (counts.invalid_geometry)
      console.log(
        "Geometry notes:",
        JSON.stringify(
          (
            await pool.query(
              "SELECT id,site_id,category,name,ST_IsValidReason(geom) reason FROM sws_features WHERE NOT ST_IsValid(geom)",
            )
          ).rows,
        ),
      );
    assert.equal(
      counts.features,
      Object.values(sites).reduce((s, v) => s + v.features.features.length, 0),
    );
    assert.equal(
      counts.samples,
      Object.values(sites).reduce((s, v) => s + v.timeline.length, 0),
    );
    assert.equal(counts.invalid_geometry, 0);
    assert.equal(counts.protected_tables, 10);
    console.log("Verified TLS database check:", JSON.stringify(counts));
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("Verification failed:", e.message);
  process.exitCode = 1;
});
