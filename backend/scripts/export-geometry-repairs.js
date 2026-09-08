require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { createPool } = require("../src/config/database");
(async () => {
  const pool = createPool();
  try {
    const result =
      await pool.query(`SELECT id,site_id,properties->>'id' feature_id,ST_IsValidReason(geom) reason,
   ST_AsGeoJSON(geom,15)::json original_geometry,ST_AsGeoJSON(ST_MakeValid(geom),15)::json geometry
   FROM sws_features WHERE NOT ST_IsValid(geom)`);
    const output = path.resolve(
      __dirname,
      "../../data/normalized/geometry-repairs.json",
    );
    if (result.rows.length) {
      fs.writeFileSync(
        output,
        JSON.stringify(
          {
            method:
              "PostGIS ST_MakeValid, topology repair only; spatial accuracy remains unverified",
            prepared_at: "2026-09-08",
            features: result.rows,
          },
          null,
          2,
        ),
      );
      console.log(
        `Exported ${result.rows.length} topology repairs for application derivatives. Source files unchanged.`,
      );
    }
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.code || "Geometry export failed");
  process.exitCode = 1;
});
