const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const { rootCertificates } = require("node:tls");

/** Create the optional PostgreSQL pool, including strict TLS for remote hosts. */
function createPool() {
  if (!process.env.DATABASE_URL) return null;

  const remote =
    /supabase\.(co|com)/.test(process.env.DATABASE_URL) ||
    process.env.NODE_ENV === "production";
  const caFile =
    process.env.DB_SSL_CA_FILE ||
    path.resolve(__dirname, "../../certs/prod-ca-2021.crt");
  const ssl =
    process.env.DB_SSL === "disable"
      ? false
      : remote
        ? {
            rejectUnauthorized: true,
            ca: [...rootCertificates, fs.readFileSync(caFile, "utf8")],
          }
        : false;
  const connection = new URL(process.env.DATABASE_URL);
  // pg URL SSL parameters override the explicit TLS object; keep one source of truth.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    connection.searchParams.delete(key);
  }

  const pool = new Pool({
    connectionString: connection.toString(),
    ssl,
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on("error", () => console.error("Database connection interrupted."));
  return pool;
}

module.exports = { createPool };
