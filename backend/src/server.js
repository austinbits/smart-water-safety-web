// backend/src/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sites
app.get('/api/sites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        site_id,
        name,
        type,
        center_lat,
        center_lng
      FROM sites
      ORDER BY site_id ASC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sites/:id/routes
app.get('/api/sites/:id/routes', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        route_id,
        source_trace_count,
        safety_score,
        ST_AsGeoJSON(geometry)::json AS geometry
      FROM consensus_routes
      WHERE site_id = $1
      ORDER BY route_id ASC
      `,
      [id]
    );

    const features = result.rows.map((row) => ({
      type: 'Feature',
      properties: {
        route_id: row.route_id,
        source_trace_count: row.source_trace_count,
        safety_score: row.safety_score,
      },
      geometry: row.geometry,
    }));

    res.status(200).json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sites/:id/danger-zones
app.get('/api/sites/:id/danger-zones', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        zone_id,
        zone_level,
        forecast_time,
        ST_AsGeoJSON(polygon)::json AS geometry
      FROM danger_zones
      WHERE site_id = $1
      ORDER BY zone_id ASC
      `,
      [id]
    );

    const features = result.rows.map((row) => ({
      type: 'Feature',
      properties: {
        zone_id: row.zone_id,
        zone_level: row.zone_level,
        forecast_time: row.forecast_time,
      },
      geometry: row.geometry,
    }));

    res.status(200).json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sites/:id/forecasts
app.get('/api/sites/:id/forecasts', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        snapshot_id,
        timestamp,
        rainfall,
        water_level,
        flow_speed,
        wind,
        status
      FROM forecast_snapshots
      WHERE site_id = $1
      ORDER BY timestamp DESC
      `,
      [id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sites/:id/safe-zones
app.get('/api/sites/:id/safe-zones', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        zone_id,
        name,
        lat,
        lng,
        capacity,
        current_occupancy
      FROM safe_zones
      WHERE site_id = $1
      ORDER BY zone_id ASC
      `,
      [id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/sos-active
app.get('/api/sos-active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sos_id,
        site_id,
        user_lat,
        user_lng,
        status,
        created_at
      FROM sos_calls
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// GET /api/rescue-teams
app.get('/api/rescue-teams', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        team_id,
        name,
        status,
        current_lat,
        current_lng,
        assigned_sos_id
      FROM rescue_teams
      ORDER BY team_id ASC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// POST /api/simulate-spike
app.post('/api/simulate-spike', async (req, res) => {
  try {
    const { site_id } = req.body;

    if (!site_id) {
      return res.status(500).json({
        error: 'site_id is required',
      });
    }

    const result = await pool.query(
      `
      UPDATE danger_zones
      SET zone_level = CASE zone_level
        WHEN 'low' THEN 'medium'
        WHEN 'medium' THEN 'high'
        WHEN 'high' THEN 'low'
        ELSE 'low'
      END,
      computed_at = NOW()
      WHERE site_id = $1
      RETURNING zone_level
      `,
      [site_id]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        error: 'No danger zones found for the specified site',
      });
    }

    const newZoneLevel = result.rows[0].zone_level;

    res.status(200).json({
      updated: true,
      new_zone_level: newZoneLevel,
      site_id: Number(site_id),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// POST /api/reset-demo
app.post('/api/reset-demo', async (req, res) => {
  try {
    await pool.query('BEGIN');

    await pool.query(`
      UPDATE danger_zones
      SET
        zone_level = 'low',
        computed_at = NOW()
    `);

    await pool.query(`
      UPDATE sos_calls
      SET status = 'pending'
      WHERE status <> 'pending'
    `);

    await pool.query('COMMIT');

    res.status(200).json({
      reset: true,
    });
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError.message);
    }

    res.status(500).json({
      error: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Water Safety API running on port ${process.env.PORT}`);
});