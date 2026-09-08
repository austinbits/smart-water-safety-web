import test from "node:test";
import assert from "node:assert/strict";
import { routeSupport } from "../../shared/consensus.mjs";
import { initialState, applyAction } from "../../shared/demo.mjs";
const geometry = {
  type: "LineString",
  coordinates: [
    [73.76, 15.54],
    [73.761, 15.54],
    [73.762, 15.54],
  ],
};
const site = {
  id: "calangute",
  features: {
    features: [
      {
        geometry,
        properties: { category: "route", id: "p1", name: "Mapped path" },
      },
    ],
  },
};
test("route proposals need three distinct reviewed traces and reject offsite or duplicate evidence", () => {
  let state = initialState();
  for (let i = 0; i < 3; i++) {
    const points = geometry.coordinates.map((p) => [p[0], p[1] + i * 0.00002]);
    state = applyAction(
      state,
      "trace",
      { site: site.id, points, consent: true },
      `test-trace-${i}`,
    );
  }
  assert.equal(routeSupport(site, state.traces)[0].count, 0);
  for (const t of state.traces)
    state = applyAction(state, "review_trace", {
      site: site.id,
      id: t.id,
      status: "reviewed",
    });
  assert.equal(routeSupport(site, state.traces)[0].eligible, true);
  const duplicate = { ...state.traces[0], id: "duplicate" };
  const offsite = {
    ...duplicate,
    id: "offsite",
    points: [
      [74, 16],
      [74.001, 16],
    ],
  };
  assert.equal(
    routeSupport(site, [...state.traces, duplicate, offsite])[0].count,
    3,
  );
  state = applyAction(state, "review_trace", {
    site: site.id,
    id: state.traces[0].id,
    status: "rejected",
  });
  assert.equal(routeSupport(site, state.traces)[0].eligible, false);
});
test("replaying an old SOS after resetting a session cannot resurrect it", () => {
  let state = applyAction(
    initialState(),
    "sos",
    { site: site.id, lng: 73.76, lat: 15.54, zone: "high" },
    "stable-sos-event",
  );
  state = applyAction(state, "reset", {}, "stable-reset-event");
  state = applyAction(
    state,
    "sos",
    { site: site.id, lng: 73.76, lat: 15.54, zone: "high" },
    "stable-sos-event",
  );
  assert.equal(state.incidents.length, 0);
});
