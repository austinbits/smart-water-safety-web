/** Create a fresh, isolated demonstration workspace. */
export function initialState() {
  return {
    version: 1,
    scenarios: { calangute: "normal", muthathi: "normal", dudhsagar: "normal" },
    incidents: [],
    messages: [],
    traces: [],
    audit: [],
    processed: [],
    teams: [
      {
        id: "calangute-alpha",
        site: "calangute",
        name: "Coastal team Alpha",
        members: 3,
        status: "available",
      },
      {
        id: "muthathi-bravo",
        site: "muthathi",
        name: "River team Bravo",
        members: 4,
        status: "available",
      },
      {
        id: "dudhsagar-charlie",
        site: "dudhsagar",
        name: "Falls team Charlie",
        members: 4,
        status: "available",
      },
    ],
  };
}
/**
 * Validate and apply one user action without mutating the previous state.
 * Event IDs ensure the same retried action is never applied twice.
 */
export function applyAction(
  previous,
  action,
  payload = {},
  eventId = crypto.randomUUID(),
) {
  if (previous.processed.includes(eventId)) return previous;
  const state = structuredClone(previous),
    now = new Date().toISOString(),
    sites = ["calangute", "muthathi", "dudhsagar"];
  if (payload.site && !sites.includes(payload.site))
    throw new Error("Unknown site.");
  if (action === "scenario") {
    if (
      !sites.includes(payload.site) ||
      !["normal", "watch", "danger"].includes(payload.value)
    )
      throw new Error("Invalid scenario.");
    state.scenarios[payload.site] = payload.value;
  } else if (action === "sos") {
    if (
      !sites.includes(payload.site) ||
      !Number.isFinite(payload.lat) ||
      !Number.isFinite(payload.lng) ||
      Math.abs(payload.lat) > 90 ||
      Math.abs(payload.lng) > 180
    )
      throw new Error("Valid site and coordinates are required.");
    if (!["high", "medium", "low", "unknown", "outside"].includes(payload.zone))
      throw new Error("Invalid zone.");
    state.incidents.unshift({
      id: eventId,
      site: payload.site,
      lat: payload.lat,
      lng: payload.lng,
      zone: payload.zone,
      status: "active",
      created_at: now,
      source: "simulation",
      note: String(payload.note || "Demonstration SOS").slice(0, 500),
    });
  } else if (action === "cancel" || action === "resolve") {
    const incident = state.incidents.find((i) => i.id === payload.id);
    if (!incident) throw new Error("Incident not found.");
    if (["cancelled", "resolved"].includes(incident.status))
      throw new Error("Incident is already closed.");
    incident.status = action === "cancel" ? "cancelled" : "resolved";
    incident.closed_at = now;
    state.teams
      .filter((t) => t.incident_id === incident.id)
      .forEach((t) => {
        t.status = "available";
        delete t.incident_id;
      });
  } else if (action === "assign") {
    const incident = state.incidents.find((i) => i.id === payload.id),
      team = state.teams.find((t) => t.id === payload.team_id);
    if (
      !incident ||
      !team ||
      incident.site !== team.site ||
      ["resolved", "cancelled"].includes(incident.status) ||
      team.status !== "available"
    )
      throw new Error(
        "Select an available team at this site and an open incident.",
      );
    if (incident.team_id)
      throw new Error("This incident already has an assigned team.");
    team.incident_id = incident.id;
    team.status = "en_route";
    incident.team_id = team.id;
    incident.status = "dispatched";
  } else if (action === "arrive") {
    const team = state.teams.find((t) => t.id === payload.team_id);
    if (!team || team.status !== "en_route")
      throw new Error("Team must be en route.");
    team.status = "on_scene";
    const incident = state.incidents.find((i) => i.id === team.incident_id);
    if (incident) incident.status = "on_scene";
  } else if (action === "message") {
    if (
      !sites.includes(payload.site) ||
      !["high", "medium", "low", "all"].includes(payload.zone) ||
      !String(payload.text || "").trim()
    )
      throw new Error("A site, zone and message are required.");
    state.messages.push({
      id: eventId,
      site: payload.site,
      zone: payload.zone,
      text: String(payload.text).trim().slice(0, 1000),
      sender: "Demo coordinator",
      timestamp: now,
      source: "simulation",
    });
    state.messages = state.messages.slice(-200);
  } else if (action === "trace") {
    if (
      !sites.includes(payload.site) ||
      !Array.isArray(payload.points) ||
      payload.points.length < 2 ||
      payload.points.length > 10000 ||
      payload.consent !== true
    )
      throw new Error(
        "A consented trace with 2–10,000 valid points is required.",
      );
    if (
      payload.points.some(
        (p) =>
          !Array.isArray(p) ||
          p.length < 2 ||
          !p.slice(0, 2).every(Number.isFinite) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90,
      )
    )
      throw new Error("Invalid trace coordinates.");
    state.traces.push({
      id: eventId,
      site: payload.site,
      points: payload.points.map((p) => p.slice(0, 2)),
      submitted_at: now,
      status: "pending_review",
      source: payload.simulation === true ? "simulation" : "consented_trace",
    });
    state.traces = state.traces.slice(-50);
  } else if (action === "review_trace") {
    const trace = state.traces.find(
      (t) => t.id === payload.id && t.site === payload.site,
    );
    if (!trace || !["reviewed", "rejected"].includes(payload.status))
      throw new Error("Select a trace and valid review status.");
    trace.status = payload.status;
    trace.reviewed_at = now;
  } else if (action === "cancel_countdown") {
    // Record a cancelled drill without creating or dispatching an incident.
  } else if (action === "reset")
    return {
      ...initialState(),
      processed: [...previous.processed, eventId].slice(-1000),
    };
  else throw new Error("Unknown action.");
  state.processed = [...state.processed, eventId].slice(-1000);
  state.audit.unshift({
    id: eventId,
    action,
    site: payload.site,
    timestamp: now,
  });
  state.audit = state.audit.slice(0, 100);
  return state;
}
