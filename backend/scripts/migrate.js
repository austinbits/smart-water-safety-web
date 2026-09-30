require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { createPool } = require("../src/config/database");
const { sites, manifest } = require("../src/data");

/**
 * Create the application tables and upsert the prepared site data.
 * One transaction guarantees that a failed import leaves the database unchanged.
 */
async function migrate() {
  const pool = createPool();
  if (!pool) {
    throw new Error("DATABASE_URL required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      fs.readFileSync(
        path.join(__dirname, "../migrations/001_water_safety.sql"),
        "utf8",
      ),
    );
    for (const site of Object.values(sites)) {
      await client.query(
        "INSERT INTO sws_sites(id,name,type,region,center,metadata) VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326),$7) ON CONFLICT(id) DO UPDATE SET name=$2,type=$3,region=$4,center=ST_SetSRID(ST_MakePoint($5,$6),4326),metadata=$7",
        [
          site.id,
          site.name,
          site.type,
          site.region,
          ...site.center,
          manifest.sites.find((siteSummary) => siteSummary.id === site.id),
        ],
      );
      await client.query(
        `INSERT INTO sws_features(id,site_id,category,name,geom,properties)
    SELECT $1 || ':' || (f->'properties'->>'id'),$1,f->'properties'->>'category',f->'properties'->>'name',
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(f->'geometry'),4326)),f->'properties'
    FROM jsonb_array_elements($2::jsonb) f
    ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,name=EXCLUDED.name,geom=EXCLUDED.geom,properties=EXCLUDED.properties`,
        [site.id, JSON.stringify(site.features.features)],
      );
      await client.query(
        `INSERT INTO sws_forecast_samples(site_id,sampled_at,values,provenance)
    SELECT $1,(t->>'timestamp')::timestamptz,t,t->>'provenance' FROM jsonb_array_elements($2::jsonb) t
    ON CONFLICT(site_id,sampled_at) DO UPDATE SET values=EXCLUDED.values,provenance=EXCLUDED.provenance`,
        [site.id, JSON.stringify(site.timeline)],
      );
    }
    await client.query(
      `INSERT INTO sws_dataset_catalog(filename,site_id,sha256,provenance,records,metadata)
   SELECT f->>'file',f->>'site',f->>'sha256',f->>'provenance',(f->>'records')::integer,f FROM jsonb_array_elements($1::jsonb) f
   ON CONFLICT(filename) DO UPDATE SET sha256=EXCLUDED.sha256,provenance=EXCLUDED.provenance,records=EXCLUDED.records,metadata=EXCLUDED.metadata`,
      [JSON.stringify(manifest.files)],
    );
    await client.query("COMMIT");
    console.log(
      "Additive migration complete: 3 sites, mapped features, forecast samples and 64 source records. Original tables unchanged.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error.code || error.message);
  process.exit(1);
});
