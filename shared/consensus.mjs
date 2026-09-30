import { distance, projectOnSegment, lineDistance } from "./engine.mjs";

// A contribution is evidence of path usage, never evidence that a path is safe.
/** Compare reviewed traces and return route-usage proposals with support counts. */
export function routeSupport(site, traces) {
  const unique = new Map();
  for (const trace of traces.filter(
    (t) => t.site === site.id && t.status === "reviewed",
  )) {
    const fingerprint = trace.points
      .map((p) => p.map((v) => v.toFixed(5)).join(","))
      .join(";");
    if (!unique.has(fingerprint)) unique.set(fingerprint, trace);
  }
  return site.features.features
    .filter(
      (f) =>
        f.properties.category === "route" && f.geometry.type === "LineString",
    )
    .map((route) => {
      const path = route.geometry.coordinates,
        support = [];
      for (const trace of unique.values()) {
        if (lineDistance(trace.points) < 20) continue;
        const sampled = trace.points.filter(
          (_, i) =>
            i % Math.max(1, Math.floor(trace.points.length / 100)) === 0,
        );
        const matching = sampled.filter((p) =>
          path
            .slice(1)
            .some((b, i) => distance(p, projectOnSegment(p, path[i], b)) <= 20),
        ).length;
        if (matching / sampled.length >= 0.7) support.push(trace.id);
      }
      return {
        route_id: route.properties.id,
        name: route.properties.name,
        trace_ids: support,
        count: support.length,
        eligible: support.length >= 3,
        geometry: route.geometry,
        verification: "usage_evidence_only",
      };
    })
    .sort((a, b) => b.count - a.count);
}
