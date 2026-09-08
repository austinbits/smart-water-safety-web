// Shared, deterministic geospatial and risk rules. These are demonstration rules,
// not a calibrated flood model or a certification of pedestrian safety.
export const rad = (d) => (d * Math.PI) / 180;
export function distance(a, b) {
  const h =
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) *
      Math.cos(rad(b[1])) *
      Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function lineDistance(points) {
  return points.slice(1).reduce((s, p, i) => s + distance(points[i], p), 0);
}
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(p, a, b) {
  return (
    Math.abs(cross(a, b, p)) < 1e-12 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-10
  );
}
export function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (onSegment(p, a, b)) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function inGeometry(p, geom) {
  if (!geom) return false;
  if (geom.type === "MultiPolygon")
    return geom.coordinates.some((c) =>
      inGeometry(p, { type: "Polygon", coordinates: c }),
    );
  return (
    geom.type === "Polygon" &&
    inRing(p, geom.coordinates[0]) &&
    !geom.coordinates.slice(1).some((r) => inRing(p, r))
  );
}
function intersection(a, b, c, d) {
  const rx = b[0] - a[0],
    ry = b[1] - a[1],
    sx = d[0] - c[0],
    sy = d[1] - c[1],
    den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-15) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
    ? [a[0] + t * rx, a[1] + t * ry]
    : null;
}
export function crossesGeometry(a, b, geom) {
  if (!geom) return false;
  if (geom.type === "MultiPolygon")
    return geom.coordinates.some((c) =>
      crossesGeometry(a, b, { type: "Polygon", coordinates: c }),
    );
  if (geom.type !== "Polygon") return false;
  if (inGeometry(a, geom) || inGeometry(b, geom)) return true;
  return geom.coordinates.some((r) =>
    r
      .slice(1)
      .some(
        (p, i) =>
          intersection(a, b, r[i], p) ||
          onSegment(a, r[i], p) ||
          onSegment(r[i], a, b),
      ),
  );
}
export function classifyPosition(position, features) {
  if (!position) return "unknown";
  const levels = features
    .filter(
      (f) =>
        f.properties.category === "hazard" && inGeometry(position, f.geometry),
    )
    .map((f) => f.properties.level);
  return levels.includes("high")
    ? "high"
    : levels.includes("medium")
      ? "medium"
      : levels.length
        ? "low"
        : "outside";
}
export const RULES = {
  beach: [
    {
      key: "wave_height",
      label: "Wave height",
      unit: "m",
      caution: 1,
      avoid: 1.5,
    },
    {
      key: "flow_speed",
      label: "Surface current",
      unit: "m/s",
      caution: 0.3,
      avoid: 0.5,
    },
    { key: "wind", label: "Wind speed", unit: "km/h", caution: 25, avoid: 40 },
  ],
  river: [
    {
      key: "rainfall",
      label: "Hourly rainfall",
      unit: "mm",
      caution: 10,
      avoid: 25,
    },
    {
      key: "upstream_rainfall",
      label: "Upstream event accumulation",
      unit: "mm",
      caution: 12,
      avoid: 38,
    },
  ],
  waterfall: [
    {
      key: "rainfall",
      label: "Hourly rainfall",
      unit: "mm",
      caution: 10,
      avoid: 25,
    },
    {
      key: "water_level",
      label: "Synthetic gauge level",
      unit: "m",
      caution: 1.2,
      avoid: 1.8,
    },
    {
      key: "level_rise",
      label: "Hourly level rise",
      unit: "m/h",
      caution: 0.15,
      avoid: 0.3,
    },
  ],
};
export function riskFor(site, values, scenario = "normal") {
  const metrics = { ...values };
  if (scenario === "watch" || scenario === "danger") {
    const danger = scenario === "danger";
    if (site.type === "beach")
      Object.assign(metrics, {
        wave_height: danger ? 1.88 : 1.3,
        flow_speed: danger ? 0.69 : 0.38,
      });
    if (site.type === "river")
      Object.assign(metrics, { upstream_rainfall: danger ? 38 : 12 });
    if (site.type === "waterfall")
      Object.assign(metrics, {
        rainfall: danger ? 32 : 14,
        water_level: danger ? 2.1 : 1.35,
        level_rise: danger ? 0.38 : 0.16,
      });
  }
  const drivers = RULES[site.type].map((r) => ({
    ...r,
    value: metrics[r.key] ?? null,
    level:
      metrics[r.key] == null
        ? "unknown"
        : metrics[r.key] >= r.avoid
          ? "avoid"
          : metrics[r.key] >= r.caution
            ? "caution"
            : "low",
  }));
  const status = drivers.some((d) => d.level === "avoid")
    ? "avoid"
    : drivers.some((d) => d.level === "caution")
      ? "caution"
      : drivers.every((d) => d.level === "unknown")
        ? "unknown"
        : "low";
  return {
    status,
    metrics,
    drivers,
    method: "Uncalibrated demonstration thresholds",
    missing: drivers.filter((d) => d.level === "unknown").map((d) => d.label),
  };
}
export function dynamicFeatures(site, scenario) {
  if (scenario === "normal") return site.features;
  return {
    ...site.features,
    features: site.features.features.map((f) => {
      if (
        f.properties.category !== "hazard" ||
        !["Polygon", "MultiPolygon"].includes(f.geometry.type) ||
        f.properties.provenance !== "synthetic"
      )
        return f;
      const polygons =
        f.geometry.type === "MultiPolygon"
          ? f.geometry.coordinates
          : [f.geometry.coordinates];
      const ring = polygons.flatMap((p) => p[0]);
      const center = ring.reduce(
        (a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length],
        [0, 0],
      );
      const factor = scenario === "danger" ? 1.25 : 1.1;
      const expanded = polygons.map((polygon) =>
        polygon.map((r) =>
          r.map((p) => [
            center[0] + (p[0] - center[0]) * factor,
            center[1] + (p[1] - center[1]) * factor,
          ]),
        ),
      );
      return {
        ...f,
        properties: {
          ...f.properties,
          level:
            scenario === "danger" || f.properties.level === "high"
              ? "high"
              : "medium",
          method:
            "Illustrative polygon expansion; not a flood extent prediction",
        },
        geometry: {
          ...f.geometry,
          coordinates:
            f.geometry.type === "MultiPolygon" ? expanded : expanded[0],
        },
      };
    }),
  };
}
export function projectOnSegment(p, a, b) {
  const scale = Math.cos(rad(p[1]));
  const dx = (b[0] - a[0]) * scale,
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * scale * dx + (p[1] - a[1]) * dy) /
        (dx * dx + dy * dy || 1),
    ),
  );
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
const graphs = new WeakMap();
export function buildGraph(features) {
  if (graphs.has(features)) return graphs.get(features);
  const segments = [];
  features
    .filter(
      (f) =>
        f.properties.category === "route" && f.geometry.type === "LineString",
    )
    .forEach((f) =>
      f.geometry.coordinates.slice(1).forEach((b, i) => {
        const a = f.geometry.coordinates[i];
        segments.push({ a, b, cuts: [a, b], route: f.properties.id });
      }),
    );
  // Split actual crossings so mapped junctions are traversable without shortcuts.
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j];
      if (
        Math.max(a.a[0], a.b[0]) < Math.min(b.a[0], b.b[0]) ||
        Math.min(a.a[0], a.b[0]) > Math.max(b.a[0], b.b[0]) ||
        Math.max(a.a[1], a.b[1]) < Math.min(b.a[1], b.b[1]) ||
        Math.min(a.a[1], a.b[1]) > Math.max(b.a[1], b.b[1])
      )
        continue;
      const p = intersection(a.a, a.b, b.a, b.b);
      if (p) {
        a.cuts.push(p);
        b.cuts.push(p);
      }
    }
  const nodes = [],
    byKey = new Map(),
    edges = [];
  const node = (p) => {
    const key = p
      .slice(0, 2)
      .map((x) => x.toFixed(6))
      .join(",");
    if (!byKey.has(key)) {
      byKey.set(key, nodes.length);
      nodes.push(p.slice(0, 2));
    }
    return byKey.get(key);
  };
  segments.forEach((s) => {
    s.cuts.sort((a, b) => distance(s.a, a) - distance(s.a, b));
    s.cuts.slice(1).forEach((p, i) => {
      const a = node(s.cuts[i]),
        b = node(p);
      if (a !== b)
        edges.push({
          a,
          b,
          meters: distance(nodes[a], nodes[b]),
          route: s.route,
        });
    });
  });
  // Only join tiny drafting gaps; no inferred routes across untraced terrain.
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (
        Math.abs(nodes[i][0] - nodes[j][0]) < 0.00012 &&
        Math.abs(nodes[i][1] - nodes[j][1]) < 0.00012
      ) {
        const d = distance(nodes[i], nodes[j]);
        if (d > 0 && d < 10)
          edges.push({
            a: i,
            b: j,
            meters: d,
            route: "drafting-gap",
            gap: true,
          });
      }
  const graph = { nodes, edges };
  graphs.set(features, graph);
  return graph;
}
export function planRoute(site, start, options = {}) {
  if (!start || !start.every(Number.isFinite))
    return {
      available: false,
      reason: "Choose a map position or enable your location.",
    };
  const base = buildGraph(site.features.features),
    nodes = base.nodes.map((p) => [...p]),
    edges = base.edges.map((e) => ({ ...e }));
  const hazards = (options.features || site.features).features.filter(
    (f) => f.properties.category === "hazard" && f.properties.level === "high",
  );
  const safe = site.features.features.filter(
    (f) =>
      f.properties.category === "candidate" &&
      f.geometry.type === "Point" &&
      !/railway|cave/i.test(f.properties.name),
  );
  if (!edges.length || !safe.length)
    return {
      available: false,
      reason:
        "No mapped pedestrian network and suitable candidate destination are available.",
    };
  function attach(p, maxDistance) {
    let nearest = null;
    for (const e of edges) {
      const q = projectOnSegment(p, nodes[e.a], nodes[e.b]);
      const d = distance(p, q);
      if (!nearest || d < nearest.d) nearest = { e, q, d };
    }
    if (!nearest || nearest.d > maxDistance) return null;
    const n = nodes.length;
    nodes.push(nearest.q);
    edges.push(
      { a: n, b: nearest.e.a, meters: distance(nearest.q, nodes[nearest.e.a]) },
      { a: n, b: nearest.e.b, meters: distance(nearest.q, nodes[nearest.e.b]) },
    );
    return { n, gap: nearest.d };
  }
  const from = attach(start, 80);
  if (!from)
    return {
      available: false,
      reason:
        "Your position is more than 80 m from the mapped path network. No off-path shortcut is generated.",
    };
  const targets = safe
    .map((f) => ({ f, snap: attach(f.geometry.coordinates, 80) }))
    .filter((t) => t.snap);
  const adjacency = nodes.map(() => []);
  edges.forEach((e) => {
    if (
      hazards.some((h) => crossesGeometry(nodes[e.a], nodes[e.b], h.geometry))
    )
      return;
    const mid = [
      (nodes[e.a][0] + nodes[e.b][0]) / 2,
      (nodes[e.a][1] + nodes[e.b][1]) / 2,
    ];
    const crowd = (site.crowd || [])
      .filter((c) => distance(mid, [c.lng, c.lat]) < 120)
      .reduce((s, c) => s + c.count, 0);
    const weight = e.meters * (1 + Math.min(crowd / 200, 2));
    adjacency[e.a].push({ to: e.b, weight, e });
    adjacency[e.b].push({ to: e.a, weight, e });
  });
  const costs = nodes.map(() => Infinity),
    prev = new Map(),
    open = new Set([from.n]);
  costs[from.n] = 0;
  while (open.size) {
    let u = null;
    for (const x of open) if (u === null || costs[x] < costs[u]) u = x;
    open.delete(u);
    for (const e of adjacency[u])
      if (costs[u] + e.weight < costs[e.to]) {
        costs[e.to] = costs[u] + e.weight;
        prev.set(e.to, u);
        open.add(e.to);
      }
  }
  const reachable = targets
    .filter(
      (t) =>
        Number.isFinite(costs[t.snap.n]) &&
        !hazards.some((h) =>
          crossesGeometry(
            nodes[t.snap.n],
            t.f.geometry.coordinates,
            h.geometry,
          ),
        ),
    )
    .sort((a, b) => costs[a.snap.n] - costs[b.snap.n]);
  if (!reachable.length)
    return {
      available: false,
      reason:
        "No connected mapped route avoids the current high-risk polygons. Contact local responders; a straight-line escape route would be misleading.",
    };
  const target = reachable[0],
    path = [];
  let u = target.snap.n;
  while (u !== undefined) {
    path.unshift(nodes[u]);
    u = prev.get(u);
  }
  if (hazards.some((h) => crossesGeometry(start, path[0], h.geometry)))
    return {
      available: false,
      reason:
        "The starting position or path connector intersects a high-risk zone. Local responder guidance is required.",
    };
  const length = lineDistance(path);
  return {
    available: true,
    geometry: { type: "LineString", coordinates: path },
    distance_m: Math.round(length),
    duration_min: Math.max(1, Math.ceil(length / 60)),
    destination: target.f.properties.name,
    verification: "candidate_only",
    start_gap_m: Math.round(from.gap),
    end_gap_m: Math.round(target.snap.gap),
    method:
      "Dijkstra on mapped pedestrian paths; hazard exclusion and synthetic crowd costs",
    warning:
      "Planning preview only. Paths and destination require field verification.",
  };
}
export function searchEstimate(points, elapsedSeconds) {
  if (!points?.length) return null;
  const last = points.at(-1),
    a = [last.lng, last.lat];
  const previous = points.at(-2);
  let speed = 0,
    heading = 0;
  if (previous) {
    const dt =
      (Date.parse(last.timestamp) - Date.parse(previous.timestamp)) / 1000;
    speed =
      dt > 0 ? Math.min(2, distance([previous.lng, previous.lat], a) / dt) : 0;
    heading = Math.atan2(
      (last.lng - previous.lng) * Math.cos(rad(last.lat)),
      last.lat - previous.lat,
    );
  }
  const seconds = Math.max(0, Math.min(600, elapsedSeconds)),
    radius = Math.min(
      1200,
      Math.max(30, seconds * (speed + 0.5) + (last.accuracy_m || 10)),
    );
  const ring = [];
  for (let i = 0; i <= 40; i++) {
    const angle = (2 * Math.PI * i) / 40;
    ring.push([
      a[0] + (Math.sin(angle) * radius) / (111320 * Math.cos(rad(a[1]))),
      a[1] + (Math.cos(angle) * radius) / 111320,
    ]);
  }
  return {
    type: "Feature",
    properties: {
      name: "Last-seen search envelope",
      category: "search",
      radius_m: Math.round(radius),
      heading_rad: heading,
      method:
        "Bounded speed/accuracy uncertainty; not a predicted exact location",
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}
