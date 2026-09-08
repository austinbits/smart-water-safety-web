// Shared incident workspace. Real accounts and invitation-only drills never mix.
const { randomBytes, createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getUser } = require("./auth");
const digest = (value) => createHash("sha256").update(value).digest("hex");
class Operations {
  constructor(pool, memory) {
    this.pool = pool;
    this.memory = memory;
    this.rows = {};
    this.chain = Promise.resolve();
  }
  async init() {
    if (this.pool)
      await this.pool.query(
        "CREATE TABLE IF NOT EXISTS sws_operations (id text PRIMARY KEY, payload jsonb NOT NULL); ALTER TABLE sws_operations ENABLE ROW LEVEL SECURITY",
      );
    else if (!this.memory) {
      try {
        this.rows = JSON.parse(
          await fs.readFile(
            path.join(__dirname, "../runtime/operations.json"),
            "utf8",
          ),
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }
  async get(id) {
    return this.pool
      ? (
          await this.pool.query(
            "SELECT payload FROM sws_operations WHERE id=$1",
            [id],
          )
        ).rows[0]?.payload
      : structuredClone(this.rows[id]);
  }
  async update(id, fn) {
    const task = this.chain.then(async () => {
      if (this.pool) {
        const c = await this.pool.connect();
        try {
          await c.query("BEGIN");
          await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
          const old = (
            await c.query(
              "SELECT payload FROM sws_operations WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0]?.payload;
          const value = await fn(old);
          await c.query(
            "INSERT INTO sws_operations VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=$2",
            [id, JSON.stringify(value)],
          );
          await c.query("COMMIT");
          return value;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      }
      const value = await fn(structuredClone(this.rows[id]));
      this.rows[id] = value;
      if (!this.memory) {
        const dir = path.join(__dirname, "../runtime");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, "operations.json.tmp"),
          JSON.stringify(this.rows),
        );
        await fs.rename(
          path.join(dir, "operations.json.tmp"),
          path.join(dir, "operations.json"),
        );
      }
      return structuredClone(value);
    });
    this.chain = task.catch(() => {});
    return task;
  }
}
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const admin = (a) => ["authority", "rescue_team", "admin"].includes(a?.role);
const validPosition = (p) =>
  Number.isFinite(p.lng) &&
  Number.isFinite(p.lat) &&
  Math.abs(p.lng) <= 180 &&
  Math.abs(p.lat) <= 90;
function publicState(state, actor) {
  if (admin(actor))
    return {
      ...state,
      processed: [],
      visitors: Object.values(state.visitors || {}),
    };
  const incidents = state.incidents.filter((i) => i.owner_id === actor.id);
  const active = incidents.filter(
    (i) => !["cancelled", "resolved"].includes(i.status),
  );
  return {
    version: 2,
    scenarios: state.scenarios,
    incidents,
    teams: state.teams
      .filter((t) => active.some((i) => i.team_id === t.id))
      .map(
        ({
          id,
          site,
          name,
          status,
          lng,
          lat,
          updated_at,
          eta_min,
          eta_method,
        }) => ({
          id,
          site,
          name,
          status,
          lng,
          lat,
          updated_at,
          eta_min,
          eta_method,
        }),
      ),
    messages: state.messages.filter(
      (m) => !m.owner_id || m.owner_id === actor.id,
    ),
    traces: [],
    audit: [],
    processed: [],
    visitors: [],
  };
}
async function installOperations(app, { pool, memory, sites }) {
  const { initialState, applyAction } = await import("../../shared/demo.mjs");
  const { distance } = await import("../../shared/engine.mjs");
  const repository = new Operations(pool, memory);
  await repository.init();
  function initial(demo = true) {
    const s = initialState();
    s.visitors = {};
    s.demo = demo;
    if (!demo) s.teams = [];
    else
      s.teams = s.teams.map((t) => ({
        ...t,
        lng: sites[t.site].center[0],
        lat: sites[t.site].center[1],
        updated_at: new Date().toISOString(),
      }));
    return s;
  }
  async function actor(req) {
    const key = req.get("X-Workspace-Key");
    if (key) {
      const s = await repository.get("session:" + digest(key));
      if (s && s.expires > Date.now()) return s;
    }
    const user = getUser(req);
    if (user) return { ...user, room: "live", demo: false };
    fail(401, "Please sign in again.");
  }
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res
        .status(e.status || 500)
        .json({
          error: e.status ? e.message : "Workspace temporarily unavailable.",
        });
    }
  };
  app.post(
    "/api/workspace/demo",
    wrap(async (req, res) => {
      const { role, name, age } = req.body;
      if (!["tourist", "admin"].includes(role))
        fail(400, "Choose tourist or admin.");
      if (
        role === "tourist" &&
        (!String(name || "").trim() ||
          !Number.isInteger(age) ||
          age < 1 ||
          age > 120)
      )
        fail(400, "Enter your name and age (1–120).");
      let code = String(req.body.code || "")
        .trim()
        .toUpperCase();
      let room;
      if (code) {
        if (!/^[A-F0-9]{16}$/.test(code))
          fail(400, "Enter the 16-character drill code.");
        room = "drill:" + digest(code);
        if (!(await repository.get(room))) fail(404, "Drill code not found.");
      } else {
        code = randomBytes(8).toString("hex").toUpperCase();
        room = "drill:" + digest(code);
        await repository.update(room, () => initial());
      }
      const key = randomBytes(32).toString("hex");
      const user = {
        id: randomBytes(16).toString("hex"),
        role,
        name: String(name || "Coordinator")
          .trim()
          .slice(0, 80),
        age: role === "tourist" ? age : null,
        room,
        demo: true,
        code,
        expires: Date.now() + 86400000,
      };
      await repository.update("session:" + digest(key), () => user);
      res.json({ key, user });
    }),
  );
  app.get(
    "/api/workspace/me",
    wrap(async (req, res) => res.json({ user: await actor(req) })),
  );
  app.get(
    "/api/workspace/state",
    wrap(async (req, res) => {
      const a = await actor(req);
      let state = await repository.get(a.room);
      if (!state)
        state = await repository.update(a.room, () => initial(a.demo));
      res.json({
        state: publicState(state, a),
        storage: pool ? "supabase" : "server",
        server_time: new Date().toISOString(),
      });
    }),
  );
  app.post(
    "/api/workspace/action",
    wrap(async (req, res) => {
      const a = await actor(req);
      const { action, payload = {}, eventId } = req.body;
      if (
        typeof eventId !== "string" ||
        !/^[a-zA-Z0-9-]{10,100}$/.test(eventId)
      )
        fail(400, "A stable request ID is required.");
      const allowed = admin(a)
        ? [
            "assign",
            "arrive",
            "resolve",
            "message",
            "scenario",
            "review_trace",
            "trace",
            "team_position",
            "register_team",
          ]
        : ["sos", "cancel", "position", "trace", "cancel_countdown"];
      if (!allowed.includes(action))
        fail(403, "This action is not available for your role.");
      if (action === "scenario" && !a.demo)
        fail(403, "Scenarios are available only in a drill.");
      const state = await repository.update(a.room, (old) => {
        let s = old || initial(a.demo);
        if (s.processed.includes(eventId)) return s;
        if (
          !admin(a) &&
          payload.id &&
          !s.incidents.some((i) => i.id === payload.id && i.owner_id === a.id)
        )
          fail(403, "This request belongs to another visitor.");
        const now = new Date().toISOString();
        if (["position", "team_position", "register_team"].includes(action)) {
          if (!validPosition(payload) || !sites[payload.site])
            fail(400, "Valid site and coordinates are required.");
          s = structuredClone(s);
          if (action === "position") {
            if (payload.consent !== true)
              fail(400, "Location sharing consent is required.");
            s.visitors[a.id] = {
              id: a.id,
              name: a.name || "Visitor",
              age: a.age ?? null,
              site: payload.site,
              lng: payload.lng,
              lat: payload.lat,
              accuracy_m: Number.isFinite(payload.accuracy_m)
                ? Math.max(0, payload.accuracy_m)
                : null,
              timestamp: now,
              role: "visitor",
              source: a.demo ? "simulation" : "consented_gps",
            };
          } else {
            let t = s.teams.find((t) => t.id === payload.team_id);
            if (action === "register_team") {
              if (!String(payload.name || "").trim())
                fail(400, "Team name required.");
              if (t) fail(409, "Team already exists.");
              t = {
                id: eventId,
                site: payload.site,
                name: String(payload.name).slice(0, 80),
                members: 1,
                status: "available",
              };
              s.teams.push(t);
            }
            if (!t || t.site !== payload.site)
              fail(400, "Select a team at this site.");
            Object.assign(t, {
              lng: payload.lng,
              lat: payload.lat,
              updated_at: now,
            });
            const i = s.incidents.find((i) => i.id === t.incident_id);
            if (i) {
              t.eta_min = Math.max(
                1,
                Math.ceil(
                  (distance([t.lng, t.lat], [i.lng, i.lat]) / 60) * 1.4,
                ),
              );
              t.eta_method =
                "Distance-based walking estimate; access and terrain may change arrival";
            }
          }
          s.processed = [...s.processed, eventId].slice(-1000);
        } else {
          if (
            action === "sos" &&
            s.incidents.some(
              (i) =>
                i.owner_id === a.id &&
                !["resolved", "cancelled"].includes(i.status),
            )
          )
            fail(409, "You already have an open help request.");
          if (
            action === "resolve" &&
            !s.incidents.some(
              (i) => i.id === payload.id && i.status === "on_scene",
            )
          )
            fail(400, "Mark the team on scene before completing rescue.");
          try {
            s = applyAction(s, action, payload, eventId);
          } catch (e) {
            fail(400, e.message);
          }
          if (action === "sos") {
            Object.assign(s.incidents[0], {
              owner_id: a.id,
              name: a.name,
              age: a.age,
              source: a.demo ? "simulation" : "visitor_request",
            });
          }
          if (action === "assign") {
            const t = s.teams.find((t) => t.id === payload.team_id),
              i = s.incidents.find((i) => i.id === payload.id);
            i.accepted_at = now;
            t.eta_min = Number.isFinite(t.lng)
              ? Math.max(
                  1,
                  Math.ceil(
                    (distance([t.lng, t.lat], [i.lng, i.lat]) / 60) * 1.4,
                  ),
                )
              : null;
            t.eta_method = "Distance-based walking estimate";
          }
        }
        return s;
      });
      res.json({
        state: publicState(state, a),
        storage: pool ? "supabase" : "server",
      });
    }),
  );
  const requireAdmin = async (req, res, next) => {
    try {
      const a = await actor(req);
      if (!admin(a)) fail(403, "Admin access required.");
      req.actor = a;
      next();
    } catch (e) {
      res.status(e.status || 503).json({ error: e.message });
    }
  };
  app.get("/api/workspace/replay/:site", requireAdmin, (req, res) =>
    res.json(sites[req.params.site]?.replay || []),
  );
  return { requireAdmin, repository };
}
module.exports = { installOperations, Operations, publicState };
