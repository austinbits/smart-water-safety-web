import test from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  inGeometry,
  crossesGeometry,
  classifyPosition,
  planRoute,
  riskFor,
  searchEstimate,
  dynamicFeatures,
} from "../../shared/engine.mjs";
const feature = (category, geometry, id = "f", extra = {}) => ({
  type: "Feature",
  properties: { id, name: id, category, ...extra },
  geometry,
});
const line = (coordinates) => ({ type: "LineString", coordinates });
const polygon = (coordinates) => ({
  type: "Polygon",
  coordinates: [coordinates],
});
test("rising-risk scenarios preserve existing high restrictions and handle repaired multipolygons", () => {
  const g = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    ],
  };
  const site = {
    features: {
      type: "FeatureCollection",
      features: [
        feature("hazard", g, "h", { level: "high", provenance: "synthetic" }),
      ],
    },
  };
  const changed = dynamicFeatures(site, "watch").features[0];
  assert.equal(changed.properties.level, "high");
  assert.equal(changed.geometry.type, "MultiPolygon");
  assert.ok(crossesGeometry([0.5, 0.1], [0.5, 0.9], changed.geometry));
});
test("boundary points, polygon holes and multipolygons classify correctly", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
        [1, 1],
      ],
    ],
  };
  assert.equal(inGeometry([0.5, 0.5], geometry), true);
  assert.equal(inGeometry([1.5, 1.5], geometry), false);
  assert.equal(inGeometry([0, 2], geometry), true);
  assert.equal(inGeometry([8, 8], geometry), false);
  assert.equal(
    inGeometry([0.5, 0.5], {
      type: "MultiPolygon",
      coordinates: [geometry.coordinates],
    }),
    true,
  );
});
test("route segments crossing narrow hazards are rejected even with endpoints outside", () => {
  const geometry = polygon([
    [0.004, -0.001],
    [0.005, -0.001],
    [0.005, 0.001],
    [0.004, 0.001],
    [0.004, -0.001],
  ]);
  assert.equal(crossesGeometry([0, 0], [0.01, 0], geometry), true);
  assert.equal(crossesGeometry([0, 0.01], [0.01, 0.01], geometry), false);
  assert.equal(
    classifyPosition(
      [0.0045, 0],
      [feature("hazard", geometry, "danger", { level: "high" })],
    ),
    "high",
  );
});
test("Dijkstra follows mapped detour and never crosses high hazard or railway geometry", () => {
  const site = {
    features: {
      type: "FeatureCollection",
      features: [
        feature(
          "route",
          line([
            [0, 0],
            [0.004, 0],
            [0.008, 0],
          ]),
          "direct",
        ),
        feature(
          "route",
          line([
            [0, 0],
            [0, 0.005],
            [0.008, 0.005],
            [0.008, 0],
          ]),
          "detour",
        ),
        feature(
          "restricted_route",
          line([
            [0, 0],
            [0.008, 0],
          ]),
          "railway",
        ),
        feature(
          "candidate",
          { type: "Point", coordinates: [0.008, 0] },
          "refuge",
        ),
        feature(
          "hazard",
          polygon([
            [0.003, -0.001],
            [0.005, -0.001],
            [0.005, 0.001],
            [0.003, 0.001],
            [0.003, -0.001],
          ]),
          "hazard",
          { level: "high" },
        ),
      ],
    },
    crowd: [],
  };
  const result = planRoute(site, [0, 0]);
  assert.equal(result.available, true);
  assert.ok(result.distance_m > 1800);
  assert.equal(result.verification, "candidate_only");
  const hazard = site.features.features.at(-1).geometry;
  result.geometry.coordinates
    .slice(1)
    .forEach((p, i) =>
      assert.equal(
        crossesGeometry(result.geometry.coordinates[i], p, hazard),
        false,
      ),
    );
});
test("disconnected destinations, railway-only graphs and far-away GPS return no route", () => {
  const base = [
    feature(
      "route",
      line([
        [0, 0],
        [0.001, 0],
      ]),
    ),
    feature(
      "candidate",
      { type: "Point", coordinates: [0.05, 0.05] },
      "candidate",
    ),
  ];
  const site = { features: { features: base }, crowd: [] };
  assert.equal(planRoute(site, [0, 0]).available, false);
  assert.equal(planRoute(site, [1, 1]).available, false);
  const rail = {
    features: {
      features: [
        feature(
          "restricted_route",
          line([
            [0, 0],
            [0.001, 0],
          ]),
        ),
        feature("candidate", { type: "Point", coordinates: [0.001, 0] }),
      ],
    },
  };
  assert.equal(planRoute(rail, [0, 0]).available, false);
});
test("risk distinguishes missing data, baseline values and scripted thresholds", () => {
  assert.equal(
    riskFor({ type: "river" }, { rainfall: null }).status,
    "unknown",
  );
  assert.equal(
    riskFor({ type: "beach" }, { wave_height: 0.8, flow_speed: 0.15, wind: 12 })
      .status,
    "low",
  );
  const spike = riskFor(
    { type: "river" },
    { rainfall: 0, water_level: null },
    "danger",
  );
  assert.equal(spike.status, "avoid");
  assert.equal(spike.metrics.water_level, null);
  assert.equal(
    riskFor({ type: "waterfall" }, { rainfall: 12, water_level: 1.3 }).status,
    "caution",
  );
});
test("last-known search envelope remains bounded and handles missing points", () => {
  assert.equal(searchEstimate([], 50), null);
  const point = {
    lat: 12,
    lng: 77,
    accuracy_m: 8,
    timestamp: "2026-09-07T00:00:00Z",
  };
  const result = searchEstimate([point], 120);
  assert.equal(result.geometry.type, "Polygon");
  assert.ok(result.properties.radius_m >= 60);
  assert.ok(distance([77, 12], result.geometry.coordinates[0][0]) < 150);
});
