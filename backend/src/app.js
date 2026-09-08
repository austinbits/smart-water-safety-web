const express = require("express");
const cors = require("cors");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Server } = require("socket.io");
const { DemoStore, hash } = require("./store");
const { sites, manifest, siteById, root } = require("./data");
const { getWeather } = require("./weather");
const { installAuth, requireOperator } = require("./auth");
async function createServer({ pool = null, memory = false } = {}) {
  const { initialState, applyAction } = await import("../../shared/demo.mjs");
  const { riskFor, dynamicFeatures, planRoute, classifyPosition } =
    await import("../../shared/engine.mjs");
  const store = new DemoStore(pool, initialState, applyAction, { memory });
  await store.init();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const origins = (
    process.env.CORS_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://smart-water-safety-web.vercel.app"
  )
    .split(",")
    .map((v) => v.trim());
  const allowed = (o) => !o || origins.includes(o);
  app.use(
    cors({
      origin: (origin, cb) =>
        allowed(origin)
          ? cb(null, true)
          : cb(Object.assign(new Error("Origin not allowed"), { status: 403 })),
      credentials: true,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cache-Control", "no-store");
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      !allowed(req.get("Origin"))
    )
      return res.status(403).json({ error: "Origin not allowed." });
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  const buckets = new Map();
  app.use("/api", (req, res, next) => {
    const key = `${req.ip}:${req.path.startsWith("/auth/login") ? "login" : "api"}`;
    const max = req.path.startsWith("/auth/login") ? 6 : 180;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.until) {
      b = { count: 0, until: now + 60000 };
      buckets.set(key, b);
    }
    if (++b.count > max)
      return res
        .status(429)
        .json({ error: "Too many requests. Try again in one minute." });
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (now > v.until) buckets.delete(k);
    next();
  });
  const server = http.createServer(app),
    io = new Server(server, {
      cors: { origin: (o, cb) => cb(null, allowed(o)), credentials: true },
      maxHttpBufferSize: 100000,
    });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.demoToken;
      if (!(await store.get(token)))
        return next(new Error("Valid demo session required"));
      socket.data.token = token;
      next();
    } catch {
      next(new Error("Session unavailable"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(hash(socket.data.token));
  });
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      version: "1.0.0",
      storage: store.mode,
      sites: Object.keys(sites).length,
      datasets: manifest.files.length,
      live_dispatch: false,
      uptime: Math.floor(process.uptime()),
    }),
  );
  app.get("/api/sites", (req, res) => res.json(manifest.sites));
  app.get("/api/data/manifest", (req, res) => res.json(manifest));
  app.get("/api/datasets/:file", async (req, res) => {
    const file = manifest.files.find((f) => f.file === req.params.file);
    if (!file) return res.status(404).json({ error: "Dataset not found." });
    const offset = Number(req.query.offset || 0),
      limit = Number(req.query.limit || 10);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return res
        .status(400)
        .json({
          error: "Offset must be nonnegative and limit between 1 and 100.",
        });
    try {
      const rows = JSON.parse(
        await fs.readFile(
          path.resolve(
            __dirname,
            "../../data/normalized/tables",
            file.file + ".json",
          ),
          "utf8",
        ),
      );
      res.json({
        records: rows.slice(offset, offset + limit),
        total: rows.length,
        provenance: file.provenance,
        issues: file.issues,
      });
    } catch {
      res
        .status(404)
        .json({
          error:
            "This file is a raster, map source or text log. Its sample and metadata are available in the register.",
        });
    }
  });
  app.get("/api/sites/:id", (req, res) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    res.json(s);
  });
  app.get("/api/sites/:id/:layer", (req, res, next) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    const categories = {
      routes: "route",
      "danger-zones": "hazard",
      "safe-zones": "candidate",
      facilities: "facility",
      terrain: "terrain",
    };
    const category = categories[req.params.layer];
    if (!category) return next();
    res.json({
      type: "FeatureCollection",
      features: s.features.features.filter(
        (f) => f.properties.category === category,
      ),
    });
  });
  app.get("/api/sites/:id/forecasts", (req, res) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    res.json(s.timeline);
  });
  app.get("/api/forecast/:id", async (req, res) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    const horizon = req.query.horizon || "now";
    if (!["now", "3h", "24h"].includes(horizon))
      return res.status(400).json({ error: "Horizon must be now, 3h or 24h." });
    const i = horizon === "3h" ? 3 : horizon === "24h" ? 24 : 0;
    res.json({
      ...riskFor(s, s.timeline[i]),
      provenance: "demonstration",
      source_timestamp: s.timeline[i].timestamp,
    });
  });
  app.get("/api/weather/:id", async (req, res) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    try {
      res.json(await getWeather(s));
    } catch {
      res
        .status(503)
        .json({
          error:
            "Weather model is unavailable. No current observation or replacement is inferred.",
        });
    }
  });
  app.get("/api/metrics/:id/history", (req, res) => {
    const s = siteById(req.params.id),
      key = req.query.metric;
    if (!s) return res.status(404).json({ error: "Site not found." });
    if (
      ![
        "rainfall",
        "water_level",
        "flow_speed",
        "wave_height",
        "wind",
        "temperature",
      ].includes(key)
    )
      return res.status(400).json({ error: "Unknown metric." });
    res.json(
      s.timeline.map((t) => ({
        timestamp: t.timestamp,
        value: t[key],
        provenance: t.provenance,
      })),
    );
  });
  app.get("/api/offline-bundle/:id", (req, res) => {
    const s = siteById(req.params.id);
    if (!s) return res.status(404).json({ error: "Site not found." });
    res.download(
      path.join(root, `${s.id}.json`),
      `${s.id}-offline-bundle.json`,
    );
  });
  app.post("/api/routes/plan", (req, res) => {
    const s = siteById(req.body.site);
    if (!s) return res.status(400).json({ error: "Unknown site." });
    const p = req.body.position;
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      return res
        .status(400)
        .json({ error: "Valid longitude and latitude required." });
    res.json(
      planRoute(s, p, {
        features: dynamicFeatures(s, req.body.scenario || "normal"),
      }),
    );
  });
  app.post("/api/zone/classify", (req, res) => {
    const s = siteById(req.body.site),
      p = req.body.position;
    if (
      !s ||
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      return res
        .status(400)
        .json({ error: "Valid site and coordinates required." });
    res.json({
      zone: classifyPosition(p, s.features.features),
      provenance: "demo_geofences",
    });
  });
  app.post("/api/demo/session", async (req, res) => {
    try {
      res.json(await store.session(req.body.token));
    } catch {
      res
        .status(503)
        .json({
          error: "Demo storage unavailable. Device demo is still available.",
        });
    }
  });
  const demo = async (req, res, next) => {
    try {
      const token = req.get("X-Demo-Session");
      const state = await store.get(token);
      if (!state)
        return res.status(401).json({ error: "Valid demo session required." });
      req.demo = { token, state };
      next();
    } catch {
      res.status(503).json({ error: "Demo storage unavailable." });
    }
  };
  app.get("/api/demo/state", demo, (req, res) =>
    res.json({ state: req.demo.state, storage: store.mode }),
  );
  app.post("/api/demo/action", demo, async (req, res) => {
    const event = req.body;
    if (
      typeof event.eventId !== "string" ||
      !/^[a-zA-Z0-9-]{10,100}$/.test(event.eventId) ||
      !event.payload ||
      typeof event.payload !== "object"
    )
      return res
        .status(400)
        .json({ error: "A stable event ID and payload are required." });
    try {
      const state = await store.action(req.demo.token, event);
      io.to(hash(req.demo.token)).emit("workspace", state);
      res.json({ state, delivery: "demo_only", storage: store.mode });
    } catch (e) {
      if (
        /Invalid|Unknown|required|Select|already|must|not found/.test(e.message)
      )
        res.status(400).json({ error: e.message });
      else
        res
          .status(503)
          .json({
            error:
              "Could not save this demo action. Retry with the same event ID.",
          });
    }
  });
  // Legacy reads remain session-scoped; mutations never reset existing production tables.
  app.get("/api/sos-active", demo, (req, res) =>
    res.json(
      req.demo.state.incidents.filter(
        (i) => !["resolved", "cancelled"].includes(i.status),
      ),
    ),
  );
  app.get("/api/rescue-teams", demo, (req, res) =>
    res.json(req.demo.state.teams),
  );
  app.get("/api/messages/:site", demo, (req, res) =>
    res.json(req.demo.state.messages.filter((m) => m.site === req.params.site)),
  );
  installAuth(app, pool);
  app.get("/api/operator/overview", requireOperator, async (req, res) => {
    if (!pool)
      return res.status(503).json({ error: "Database not configured." });
    try {
      const incidents = await pool.query(
        "SELECT id,site_id,zone_level,status,created_at FROM sws_incidents ORDER BY created_at DESC LIMIT 100",
      );
      res.json({
        incidents: incidents.rows,
        live_dispatch: false,
        message: "No official dispatch integration is connected.",
      });
    } catch {
      res.status(503).json({ error: "Operational tables unavailable." });
    }
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const dist = path.resolve(__dirname, "../../frontend/dist");
  app.use(express.static(dist));
  app.get("/{*path}", (req, res, next) =>
    res.sendFile(path.join(dist, "index.html"), (e) => e && next()),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res
      .status(err.status || 500)
      .json({
        error:
          err.status === 413
            ? "Request too large."
            : err.status === 400
              ? "Invalid JSON request."
              : err.status === 403
                ? "Origin not allowed."
                : "The request could not be completed.",
      });
  });
  return { app, server, io, store };
}
module.exports = { createServer };
