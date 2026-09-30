import { classifyPosition, dynamicFeatures } from "../../../shared/engine.mjs";
import { zoneForecast } from "../../../shared/navigation.mjs";

/** Incident states that no longer represent an active emergency. */
export const CLOSED_INCIDENT_STATUSES = new Set(["resolved", "cancelled"]);

/** Friendly placeholder names used only for explicitly labelled demo visitors. */
const DEMO_VISITOR_NAMES = [
  "Aarav",
  "Diya",
  "Ishaan",
  "Meera",
  "Rohan",
  "Ananya",
  "Kabir",
  "Nisha",
];

/** Find the midday sample used as the starting point for the replay control. */
export function findReplayStart(site) {
  if (!site) return 0;

  return Math.max(
    0,
    site.timeline.findIndex((sample) =>
      sample.timestamp.startsWith("2026-09-07T12"),
    ),
  );
}

/** Convert an animation frame into the corresponding weather sample. */
export function getTimelineSample(site, replayStart, frame) {
  if (!site) return undefined;

  const sampleOffset = Math.floor(frame / 3);
  const sampleIndex = Math.min(
    site.timeline.length - 1,
    replayStart + sampleOffset,
  );

  return site.timeline[sampleIndex];
}

/**
 * Apply scenario and forecast information to map features.
 * The original feature data stays immutable; display-only fields are added to copies.
 */
export function buildDisplayFeatures({
  frame,
  replayStart,
  sample,
  scenario,
  site,
}) {
  if (!site) return null;

  const previousSampleIndex = Math.max(
    0,
    replayStart + Math.floor(frame / 3) - 1,
  );
  const scenarioFeatures = dynamicFeatures(site, scenario);
  const zoneStatuses = zoneForecast(
    site,
    sample,
    site.timeline[previousSampleIndex],
    scenario,
  );

  const features = scenarioFeatures.features.map((feature) => {
    const status = zoneStatuses.find(
      (zone) => zone.id === feature.properties.id,
    );

    if (!status) return feature;

    const isHazard = feature.properties.category === "hazard";
    return {
      ...feature,
      properties: {
        ...feature.properties,
        display_level: status.level,
        rising: status.rising,
        ...(isHazard ? { level: status.level } : {}),
      },
    };
  });

  return { ...scenarioFeatures, features };
}

/** Add harmless display information to anonymous replay coordinates. */
export function buildDemoVisitors(replay, frame, shouldShowReplay) {
  if (!shouldShowReplay) return [];

  return (replay[frame] ?? []).map((person, index) => ({
    ...person,
    name: `${DEMO_VISITOR_NAMES[index % DEMO_VISITOR_NAMES.length]} (demo)`,
    age: 19 + (index % 38),
    source: "simulation",
  }));
}

/** Return only the people the current role is allowed to see on the map. */
export function buildVisiblePeople({ admin, replayVisitors, siteId, state }) {
  const teams = state.teams
    .filter((team) => team.site === siteId && Number.isFinite(team.lng))
    .map((team) => ({ ...team, role: "team" }));

  if (!admin) return teams;

  const visitors = (state.visitors ?? []).filter(
    (visitor) => visitor.site === siteId,
  );
  return [...replayVisitors, ...visitors, ...teams];
}

/** Pick the best available position for routing and zone classification. */
export function getMapPosition(location, site) {
  if (location) return [location.lng, location.lat];
  return site?.planning_start ?? site?.center;
}

/** Classify a position only after both the position and features are available. */
export function getPositionZone(position, features) {
  if (!position || !features) return "unknown";
  return classifyPosition(position, features.features);
}

/**
 * Create a safe demonstration point near the middle of the first hazard polygon.
 * This never represents a real person's position.
 */
export function getEmergencyDemoPosition(features, fallbackPosition) {
  const hazard = features?.features.find(
    (feature) =>
      feature.properties.category === "hazard" &&
      feature.geometry.type === "Polygon",
  );
  const ring = hazard?.geometry.coordinates[0];

  if (!ring?.length) return fallbackPosition;

  return ring.reduce(
    (center, point) => [
      center[0] + point[0] / ring.length,
      center[1] + point[1] / ring.length,
    ],
    [0, 0],
  );
}
