const fs = require("node:fs/promises");
const path = require("node:path");
const { randomBytes, createHash } = require("node:crypto");
const hash = (t) => createHash("sha256").update(t).digest("hex");
class DemoStore {
  constructor(pool, initialState, applyAction, { memory = false } = {}) {
    this.pool = pool;
    this.initialState = initialState;
    this.applyAction = applyAction;
    this.sessions = new Map();
    this.locks = new Map();
    this.mode = memory ? "memory" : "device";
    this.memory = memory;
    this.dir = path.resolve(__dirname, "../runtime");
  }
  async init() {
    if (this.pool) {
      try {
        await this.pool.query(
          "SELECT session_hash FROM sws_demo_sessions LIMIT 1",
        );
        this.mode = "supabase";
      } catch {
        this.mode = "device";
      }
    }
    if (!this.memory) await fs.mkdir(this.dir, { recursive: true });
  }
  async get(token) {
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    const key = hash(token);
    if (this.sessions.has(key)) return this.sessions.get(key);
    let state;
    if (this.mode === "supabase") {
      const r = await this.pool.query(
        "SELECT payload FROM sws_demo_sessions WHERE session_hash=$1 AND updated_at>NOW()-INTERVAL '30 days'",
        [key],
      );
      state = r.rows[0]?.payload;
    } else if (!this.memory) {
      try {
        const r = JSON.parse(
          await fs.readFile(path.join(this.dir, `${key}.json`), "utf8"),
        );
        if (Date.now() - r.updated_at < 30 * 86400000) state = r.payload;
      } catch {
        /* new session */
      }
    }
    if (state) this.sessions.set(key, state);
    return state || null;
  }
  async save(token, state) {
    const key = hash(token);
    if (this.mode === "supabase")
      await this.pool.query(
        "INSERT INTO sws_demo_sessions(session_hash,payload) VALUES($1,$2) ON CONFLICT(session_hash) DO UPDATE SET payload=$2,updated_at=NOW()",
        [key, state],
      );
    else if (!this.memory) {
      const file = path.join(this.dir, `${key}.json`);
      await fs.writeFile(
        file + ".tmp",
        JSON.stringify({ updated_at: Date.now(), payload: state }),
      );
      await fs.rename(file + ".tmp", file);
    }
    this.sessions.set(key, state);
  }
  async session(existing) {
    const current = await this.get(existing);
    if (current) return { token: existing, state: current, storage: this.mode };
    if (this.sessions.size >= 1000)
      throw new Error("Demo session limit reached.");
    const token = randomBytes(32).toString("hex"),
      state = this.initialState();
    await this.save(token, state);
    return { token, state, storage: this.mode };
  }
  async action(token, event) {
    const key = hash(token),
      prior = this.locks.get(key) || Promise.resolve();
    const task = prior
      .catch(() => {})
      .then(async () => {
        if (this.mode === "supabase") {
          const client = await this.pool.connect();
          try {
            await client.query("BEGIN");
            const result = await client.query(
              "SELECT payload FROM sws_demo_sessions WHERE session_hash=$1 FOR UPDATE",
              [key],
            );
            if (!result.rows[0]) throw new Error("Demo session expired.");
            const state = this.applyAction(
              result.rows[0].payload,
              event.action,
              event.payload,
              event.eventId,
            );
            await client.query(
              "UPDATE sws_demo_sessions SET payload=$2,updated_at=NOW() WHERE session_hash=$1",
              [key, state],
            );
            await client.query("COMMIT");
            this.sessions.set(key, state);
            return state;
          } catch (e) {
            await client.query("ROLLBACK");
            throw e;
          } finally {
            client.release();
          }
        }
        const current = await this.get(token);
        if (!current) throw new Error("Demo session expired.");
        const state = this.applyAction(
          current,
          event.action,
          event.payload,
          event.eventId,
        );
        await this.save(token, state);
        return state;
      });
    this.locks.set(key, task);
    try {
      return await task;
    } finally {
      if (this.locks.get(key) === task) this.locks.delete(key);
    }
  }
}
module.exports = { DemoStore, hash };
