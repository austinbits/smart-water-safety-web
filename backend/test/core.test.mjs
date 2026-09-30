import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { initialState, applyAction } from "../../shared/demo.mjs";
import {
  dynamicFeatures,
  rankRescueTeams,
  riskFor,
} from "../../shared/engine.mjs";

const require = createRequire(import.meta.url);
const { sites } = require("../src/data.js");

test("danger scenarios increase risk and expand hazard geometry", () => {
  const site = sites.calangute;
  const normalRisk = riskFor(site, site.timeline[0], "normal");
  const dangerRisk = riskFor(site, site.timeline[0], "danger");
  assert.ok(dangerRisk.score >= normalRisk.score);
  assert.equal(dangerRisk.confidence, 100);

  const original = site.features.features.find(
    (feature) =>
      feature.properties.category === "hazard" &&
      feature.geometry.type === "Polygon",
  );
  const expanded = dynamicFeatures(site, "danger").features.find(
    (feature) => feature.properties.id === original.properties.id,
  );
  assert.notDeepEqual(
    expanded.geometry.coordinates,
    original.geometry.coordinates,
  );
  assert.ok(expanded.properties.expansion_factor > 1);
});

test("rescue recommendation prefers an available, closer team", () => {
  const incident = { site: "calangute", lng: 73.75, lat: 15.54 };
  const ranked = rankRescueTeams(incident, [
    {
      id: "far",
      site: "calangute",
      name: "Far team",
      status: "available",
      members: 2,
      lng: 73.76,
      lat: 15.55,
    },
    {
      id: "near",
      site: "calangute",
      name: "Near team",
      status: "available",
      members: 3,
      lng: 73.7501,
      lat: 15.5401,
    },
  ]);
  assert.equal(ranked[0].id, "near");
  assert.ok(ranked[0].eta_min >= 1);
});

test("emergency workflow is idempotent and follows its state machine", () => {
  let state = initialState();
  const sos = {
    site: "calangute",
    lng: 73.75,
    lat: 15.54,
    zone: "high",
    note: "Automated drill",
  };
  state = applyAction(state, "sos", sos, "event-sos-0001");
  const duplicate = applyAction(state, "sos", sos, "event-sos-0001");
  assert.deepEqual(duplicate, state);
  assert.equal(state.incidents.length, 1);

  state = applyAction(
    state,
    "assign",
    { id: "event-sos-0001", team_id: "calangute-alpha" },
    "event-assign-01",
  );
  assert.equal(state.incidents[0].status, "dispatched");
  state = applyAction(
    state,
    "arrive",
    { team_id: "calangute-alpha" },
    "event-arrive-01",
  );
  assert.equal(state.incidents[0].status, "on_scene");
  state = applyAction(
    state,
    "resolve",
    { id: "event-sos-0001" },
    "event-resolve-1",
  );
  assert.equal(state.incidents[0].status, "resolved");
  assert.equal(state.teams[0].status, "available");
});
