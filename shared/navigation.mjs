import {
  planRoute,
  distance,
  crossesGeometry,
  projectOnSegment,
  riskFor,
  inGeometry,
} from "./engine.mjs";
export const destinations = (site) =>
  site.features.features.filter(
    (f) =>
      f.geometry.type === "Point" &&
      ["candidate", "facility", "landmark"].includes(f.properties.category) &&
      !/railway|cave|river$|main falls area/i.test(f.properties.name),
  );
/** Build several safe mapped route choices for comparison in the Explore page. */
export function alternatives(site, start, options = {}) {
  const results = [],
    penalized = new Set();
  for (let i = 0; i < 3; i++) {
    const r = planRoute(site, start, { ...options, penalized });
    if (!r.available) {
      if (results.length) return { routes: results };
      const diagnostic = options.destination
        ? planRoute(site, start, {
            ...options,
            features: { type: "FeatureCollection", features: [] },
          })
        : null;
      return {
        routes: [],
        reason: r.reason,
        blocked: diagnostic?.available
          ? {
              ...diagnostic,
              color: "#d33f55",
              label: "Blocked hazard crossing — do not follow",
            }
          : null,
      };
    }
    if (
      results.some(
        (p) => JSON.stringify(p.geometry) === JSON.stringify(r.geometry),
      )
    )
      break;
    const moderate = (options.features || site.features).features.some(
      (f) =>
        f.properties.category === "hazard" &&
        f.properties.level === "medium" &&
        r.geometry.coordinates
          .slice(1)
          .some((p, j) =>
            crossesGeometry(p, r.geometry.coordinates[j], f.geometry),
          ),
    );
    const profile = routeProfile(options.elevationModel, r.geometry);
    const terrain = summarizeTerrain(profile);
    const crowdExposure = routeCrowdExposure(site, r.geometry);
    const exposurePenalty = moderate ? 25 : 0;
    const crowdPenalty = Math.min(25, Math.round(crowdExposure / 12));
    const slopePenalty = Math.min(20, Math.round(terrain.maximumSlope * 2));
    const safetyScore = Math.max(
      0,
      100 - exposurePenalty - crowdPenalty - slopePenalty,
    );

    results.push({
      ...r,
      color: ["#07866f", "#4268d5", "#a058bd"][i],
      label: ["Recommended route", "Alternative route", "Third option"][i],
      risk: moderate ? "Moderate exposure" : "Lower modeled exposure",
      safety_score: safetyScore,
      crowd_exposure: crowdExposure,
      elevation_gain_m: terrain.elevationGain,
      maximum_slope_percent: terrain.maximumSlope,
      reasons: [
        moderate
          ? "Crosses a medium-risk area"
          : "Avoids current medium/high hazard crossings",
        crowdExposure
          ? `Passes near approximately ${crowdExposure} simulated visitors`
          : "No significant simulated crowd exposure",
        terrain.hasElevation
          ? `${terrain.elevationGain} m estimated climb; steepest segment ${terrain.maximumSlope}%`
          : "Terrain profile unavailable",
      ],
    });
    for (const f of site.features.features.filter(
      (f) => f.properties.category === "route",
    ))
      if (
        f.geometry.coordinates.some((p) =>
          r.geometry.coordinates
            .slice(1)
            .some(
              (q, j) =>
                distance(p, projectOnSegment(p, q, r.geometry.coordinates[j])) <
                3,
            ),
        )
      )
        penalized.add(f.properties.id);
  }
  return { routes: results };
}
/** Read an approximate elevation from the nearest cell in a prepared grid. */
export function elevationAt(dem, p) {
  if (!dem) return null;
  const [w, s, e, n] = dem.bounds;
  if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) return null;
  const x = Math.round(((p[0] - w) / (e - w)) * (dem.size - 1)),
    y = Math.round(((p[1] - s) / (n - s)) * (dem.size - 1));
  return dem.points[y * dem.size + x]?.[2] ?? null;
}
/** Sample a route and summarize its elevation gain, loss, and steepest section. */
export function routeProfile(dem, geometry) {
  if (!geometry || !dem) return [];
  let meters = 0;
  return geometry.coordinates.map((p, i, all) => {
    if (i) meters += distance(all[i - 1], p);
    return { meters: Math.round(meters), elevation: elevationAt(dem, p) };
  });
}

/** Summarize elevation gain and maximum grade from a sampled route profile. */
export function summarizeTerrain(profile) {
  let elevationGain = 0;
  let maximumSlope = 0;
  let hasElevation = false;

  for (let index = 1; index < profile.length; index++) {
    const previous = profile[index - 1];
    const current = profile[index];
    if (
      !Number.isFinite(previous.elevation) ||
      !Number.isFinite(current.elevation)
    ) {
      continue;
    }

    hasElevation = true;
    const elevationChange = current.elevation - previous.elevation;
    const horizontalDistance = current.meters - previous.meters;
    if (elevationChange > 0) elevationGain += elevationChange;
    if (horizontalDistance > 0) {
      maximumSlope = Math.max(
        maximumSlope,
        Math.abs((elevationChange / horizontalDistance) * 100),
      );
    }
  }

  return {
    elevationGain: Math.round(elevationGain),
    maximumSlope: Math.round(maximumSlope),
    hasElevation,
  };
}

/** Count simulated crowd exposure near any point on a proposed route. */
function routeCrowdExposure(site, geometry) {
  if (!geometry?.coordinates?.length) return 0;

  return (site.crowd || [])
    .filter((crowd) =>
      geometry.coordinates.some(
        (position) => distance(position, [crowd.lng, crowd.lat]) < 100,
      ),
    )
    .reduce((total, crowd) => total + crowd.count, 0);
}
/** Calculate a display status for every mapped zone at one point in time. */
export function zoneForecast(site, values, previous = {}, scenario = "normal") {
  const risk = riskFor(site, values, scenario),
    old = riskFor(site, previous, "normal");
  const stress = Math.max(
    0,
    ...risk.drivers
      .filter((d) => Number.isFinite(d.value))
      .map((d) => d.value / d.avoid),
  );
  const last = Math.max(
    0,
    ...old.drivers
      .filter((d) => Number.isFinite(d.value))
      .map((d) => d.value / d.avoid),
  );
  const polygons = site.features.features.filter(
    (f) => f.properties.category === "hazard",
  );
  const points = site.features.features.filter(
    (f) =>
      f.geometry.type === "Point" &&
      ["candidate", "landmark", "facility"].includes(f.properties.category),
  );
  return [...polygons, ...points].map((f) => {
    const exposure =
      f.properties.level ||
      (f.geometry.type === "Point"
        ? polygons
            .filter((h) => inGeometry(f.geometry.coordinates, h.geometry))
            .map((h) => h.properties.level)
            .sort(
              (a, b) =>
                ["high", "medium", "low"].indexOf(a) -
                ["high", "medium", "low"].indexOf(b),
            )[0]
        : null) ||
      "low";
    const base = { high: 0.75, medium: 0.4, low: 0.12 }[exposure] ?? 0.4;
    const sensitivity =
      f.properties.category === "candidate"
        ? 0.13
        : site.type === "beach"
          ? 0.38
          : site.type === "river"
            ? 0.46
            : 0.55;
    const score = Math.min(1, base + stress * sensitivity),
      delta = (stress - last) * sensitivity;
    const level = score >= 0.75 ? "high" : score >= 0.38 ? "medium" : "low";
    return {
      id: f.properties.id,
      name: f.properties.name,
      geometry: f.geometry,
      level,
      rising: delta > 0.03,
      status:
        level === "high"
          ? "Dangerous"
          : delta > 0.03
            ? "Risk increasing"
            : level === "medium"
              ? "Moderate"
              : "Lower risk",
      score: Math.round(score * 100),
      provenance: "Illustrative spatial risk model; not field-calibrated",
      drivers: risk.drivers
        .filter((d) => d.level !== "low" && d.level !== "unknown")
        .map((d) => d.label),
      coverage: risk.missing.length ? "Partial inputs" : "Demo/model inputs",
    };
  });
}
