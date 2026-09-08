import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialState, applyAction } from "../../shared/demo.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createServer } = require("../src/app");
test("complete SOS workflow is idempotent and releases teams on resolution", () => {
  const id = randomUUID();
  let state = applyAction(
    initialState(),
    "sos",
    { site: "calangute", lng: 73.76, lat: 15.54, zone: "high" },
    id,
  );
  assert.equal(
    applyAction(
      state,
      "sos",
      { site: "calangute", lng: 73.76, lat: 15.54, zone: "high" },
      id,
    ).incidents.length,
    1,
  );
  assert.throws(() =>
    applyAction(state, "assign", { id, team_id: "muthathi-bravo" }),
  );
  state = applyAction(state, "assign", { id, team_id: "calangute-alpha" });
  assert.equal(state.incidents[0].status, "dispatched");
  assert.throws(() =>
    applyAction(state, "assign", { id, team_id: "calangute-alpha" }),
  );
  state = applyAction(state, "arrive", { team_id: "calangute-alpha" });
  assert.equal(state.incidents[0].status, "on_scene");
  state = applyAction(state, "resolve", { id });
  assert.equal(state.teams[0].status, "available");
  assert.equal(state.incidents[0].status, "resolved");
});
test("invalid coordinates, missing consent and unauthorized message channels are rejected", () => {
  assert.throws(() =>
    applyAction(initialState(), "sos", {
      site: "calangute",
      lng: 200,
      lat: 15,
      zone: "high",
    }),
  );
  assert.throws(() =>
    applyAction(initialState(), "trace", {
      site: "calangute",
      points: [
        [73, 15],
        [74, 16],
      ],
      consent: false,
    }),
  );
  assert.throws(() =>
    applyAction(initialState(), "message", {
      site: "unknown",
      zone: "all",
      text: "test",
    }),
  );
  assert.throws(() =>
    applyAction(initialState(), "message", {
      site: "calangute",
      zone: "admin",
      text: "test",
    }),
  );
});
test("HTTP sessions isolate users, validate input and persist queued actions once", async () => {
  const { server, io } = await createServer({ memory: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body, token) => {
    const r = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Demo-Session": token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const health = await request("/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.datasets, 64);
    assert.equal((await request("/operator/overview")).status, 401);
    assert.equal((await request("/demo/state")).status, 401);
    const a = (await request("/demo/session", "POST", {})).data,
      b = (await request("/demo/session", "POST", {})).data;
    assert.notEqual(a.token, b.token);
    const event = {
      action: "sos",
      payload: { site: "muthathi", lng: 77.295, lat: 12.308, zone: "high" },
      eventId: randomUUID(),
    };
    const results = await Promise.all([
      request("/demo/action", "POST", event, a.token),
      request("/demo/action", "POST", event, a.token),
    ]);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(
      (await request("/demo/state", "GET", null, a.token)).data.state.incidents
        .length,
      1,
    );
    assert.equal(
      (await request("/demo/state", "GET", null, b.token)).data.state.incidents
        .length,
      0,
    );
    assert.equal(
      (
        await request(
          "/demo/action",
          "POST",
          {
            ...event,
            eventId: randomUUID(),
            payload: { ...event.payload, lat: null },
          },
          a.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/routes/plan", "POST", {
          site: "muthathi",
          position: [200, 100],
        })
      ).status,
      400,
    );
    assert.equal((await request("/sites/invalid")).status, 404);
    const blocked = await fetch(origin + "/api/demo/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(blocked.status, 403);
    const resolve = {
      action: "resolve",
      payload: { id: event.eventId, site: "muthathi" },
      eventId: randomUUID(),
    };
    assert.equal(
      (await request("/demo/action", "POST", resolve, a.token)).status,
      200,
    );
    assert.equal(
      (await request("/demo/state", "GET", null, a.token)).data.state
        .incidents[0].status,
      "resolved",
    );
  } finally {
    await new Promise((r) => io.close(r));
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
