require('dotenv').config();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in the environment variables.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT) || 10000,
});

pool.on('connect', () => {
  console.log('PostgreSQL database connection established.');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Test connection on startup
(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    console.log('PostgreSQL database connection successful.');
    client.release();
  } catch (error) {
    console.error('PostgreSQL database connection failed:', error.message);
  }
})();

module.exports = pool;