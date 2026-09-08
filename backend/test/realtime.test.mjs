import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createServer } = require("../src/app");
const { io: client } = createRequire(
  new URL("../../frontend/package.json", import.meta.url),
)("socket.io-client");

test("realtime events reach only the owning demo session and invalid tokens are rejected", async () => {
  const { server, io } = await createServer({ memory: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const post = async (path, body, token) => {
    const r = await fetch(url + "/api" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Demo-Session": token } : {}),
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const connect = (token) =>
    new Promise((resolve, reject) => {
      const socket = client(url, {
        auth: { demoToken: token },
        transports: ["websocket"],
        reconnection: false,
        timeout: 2000,
      });
      sockets.push(socket);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  try {
    const a = await post("/demo/session", {}),
      b = await post("/demo/session", {});
    const first = await connect(a.token),
      second = await connect(b.token);
    await assert.rejects(connect("invalid-token"), /session/i);
    let leaked = false;
    second.on("workspace", () => {
      leaked = true;
    });
    const updated = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No realtime update")),
        2000,
      );
      first.once("workspace", (s) => {
        clearTimeout(timer);
        resolve(s);
      });
    });
    await post(
      "/demo/action",
      {
        eventId: "realtime-demo-event",
        action: "message",
        payload: {
          site: "calangute",
          zone: "high",
          text: "Test coordination message",
        },
      },
      a.token,
    );
    assert.equal(
      (await updated).messages.at(-1).text,
      "Test coordination message",
    );
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(leaked, false);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise((r) => io.close(r));
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
