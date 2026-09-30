import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../src/app.js");

/** Start an isolated in-memory API and return its temporary base URL. */
async function startApi() {
  const instance = await createServer({ memory: true });
  await new Promise((resolve) =>
    instance.server.listen(0, "127.0.0.1", resolve),
  );
  const { port } = instance.server.address();
  return {
    ...instance,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => instance.io.close(resolve)),
  };
}

test("health checks and authenticated workspace events are operational", async () => {
  const api = await startApi();
  try {
    const healthResponse = await fetch(`${api.url}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ready");
    assert.equal(health.checks.workspace_storage, "memory");

    const routeResponse = await fetch(`${api.url}/api/routes/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: "calangute",
        position: [73.75, 15.54],
        scenario: "danger",
      }),
    });
    const routes = await routeResponse.json();
    assert.equal(routeResponse.status, 200);
    assert.equal(routes.scenario, "danger");
    assert.ok(Array.isArray(routes.routes));
    if (routes.routes.length) {
      assert.ok(Number.isFinite(routes.routes[0].safety_score));
      assert.ok(Array.isArray(routes.routes[0].reasons));
    }

    const loginResponse = await fetch(`${api.url}/api/workspace/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "tourist", name: "Test visitor", age: 25 }),
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.match(loginResponse.headers.get("set-cookie"), /sws_workspace=/);

    const eventsResponse = await fetch(`${api.url}/api/workspace/events`, {
      headers: { "X-Workspace-Key": login.key },
    });
    assert.equal(eventsResponse.status, 200);
    assert.match(
      eventsResponse.headers.get("content-type"),
      /text\/event-stream/,
    );

    const actionResponse = await fetch(`${api.url}/api/workspace/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Key": login.key,
      },
      body: JSON.stringify({
        action: "sos",
        eventId: "integration-sos-01",
        payload: {
          site: "calangute",
          lng: 73.75,
          lat: 15.54,
          zone: "high",
          note: "Integration drill",
        },
      }),
    });
    assert.equal(actionResponse.status, 200);

    const reader = eventsResponse.body.getReader();
    const decoder = new TextDecoder();
    let received = "";
    for (
      let attempt = 0;
      attempt < 4 && !received.includes("event: workspace");
      attempt += 1
    ) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += decoder.decode(chunk.value);
    }
    await reader.cancel();
    assert.match(received, /event: workspace/);
    assert.match(received, /integration-sos-01/);
  } finally {
    await api.close();
  }
});
