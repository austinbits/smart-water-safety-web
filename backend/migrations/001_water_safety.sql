-- Additive schema. Existing week-one tables and records are not modified.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS sws_sites (
 id text PRIMARY KEY, name text NOT NULL, type text NOT NULL CHECK(type IN ('beach','river','waterfall')),
 region text NOT NULL, center geometry(Point,4326) NOT NULL, metadata jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS sws_features (
 id text PRIMARY KEY, site_id text NOT NULL REFERENCES sws_sites(id), category text NOT NULL,
 name text NOT NULL, geom geometry(Geometry,4326), properties jsonb NOT NULL,
 verification text NOT NULL DEFAULT 'field_verification_required'
);
CREATE INDEX IF NOT EXISTS sws_features_geom_idx ON sws_features USING gist(geom);
CREATE INDEX IF NOT EXISTS sws_features_site_idx ON sws_features(site_id,category);
CREATE TABLE IF NOT EXISTS sws_dataset_catalog (
 filename text PRIMARY KEY, site_id text NOT NULL REFERENCES sws_sites(id), sha256 text NOT NULL,
 provenance text NOT NULL, records integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS sws_forecast_samples (
 site_id text NOT NULL REFERENCES sws_sites(id), sampled_at timestamptz NOT NULL,
 values jsonb NOT NULL, provenance text NOT NULL, PRIMARY KEY(site_id,sampled_at)
);
CREATE TABLE IF NOT EXISTS sws_demo_sessions (
 session_hash text PRIMARY KEY CHECK(length(session_hash)=64), payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sws_demo_expiry_idx ON sws_demo_sessions(updated_at);
CREATE TABLE IF NOT EXISTS sws_operator_roles (
 user_id uuid PRIMARY KEY, role text NOT NULL CHECK(role IN ('authority','rescue_team'))
);
CREATE TABLE IF NOT EXISTS sws_incidents (
 id uuid PRIMARY KEY, site_id text NOT NULL REFERENCES sws_sites(id), owner_id uuid NOT NULL,
 geom geometry(Point,4326) NOT NULL, zone_level text NOT NULL CHECK(zone_level IN ('high','medium','low','unknown')),
 status text NOT NULL CHECK(status IN ('pending','active','dispatched','on_scene','cancelled','resolved')),
 created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
 external_dispatch_status text NOT NULL DEFAULT 'not_connected'
);
CREATE INDEX IF NOT EXISTS sws_incidents_geom_idx ON sws_incidents USING gist(geom);
CREATE TABLE IF NOT EXISTS sws_trace_submissions (
 id uuid PRIMARY KEY, site_id text NOT NULL REFERENCES sws_sites(id), path geometry(LineString,4326) NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT NOW(), review_status text NOT NULL DEFAULT 'pending_review',
 consent_version text NOT NULL, source_trace_count integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sws_messages (
 id uuid PRIMARY KEY, site_id text NOT NULL REFERENCES sws_sites(id), sender_id uuid NOT NULL,
 zone_level text NOT NULL, content text NOT NULL CHECK(length(content)<=1000), sent_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sws_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action text NOT NULL,
 actor_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT NOW()
);
-- Access is through the Express API. Do not expose demo tokens, traces or incidents
-- via anonymous Supabase REST calls. Operator roles are assigned by administrators.
ALTER TABLE sws_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_dataset_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_forecast_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_operator_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_trace_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sws_audit_log ENABLE ROW LEVEL SECURITY;
