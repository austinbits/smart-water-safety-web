import { useState } from "react";
import { useWater } from "../store/water-context";
import { useAuth } from "../store/auth-context";
import { SiteSwitcher, ReplayBar, ScenarioControl } from "../components/Shared";
import WaterMap from "../components/WaterMap";
import Contributions from "../components/Contributions";
import { rankRescueTeams, searchEstimate } from "../../../shared/engine.mjs";

const CLOSED_STATUSES = new Set(["resolved", "cancelled"]);

/** Coordinate incidents, rescue teams, visitors, and reviewed route evidence. */
export default function RescueDashboard() {
  const {
    site,
    siteId,
    state,
    people,
    dispatch,
    notify,
    syncedAt,
    connection,
  } = useWater();
  const { user } = useAuth();
  const [tab, setTab] = useState("response");
  const [busy, setBusy] = useState(false);
  const [teamPick, setTeamPick] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const teams = state.teams.filter((team) => team.site === siteId);
  const incidents = state.incidents.filter(
    (incident) => incident.site === siteId,
  );
  const visitors = people.filter((person) => person.role === "visitor");

  /** Dispatch one operator action and surface any server validation message. */
  async function act(action, payload) {
    setBusy(true);
    try {
      await dispatch(action, { ...payload, site: siteId });
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  // Older last-known positions produce a larger, but bounded, search envelope.
  const stale = selected?.timestamp
    ? Math.max(
        0,
        ((syncedAt || Date.parse(selected.timestamp)) -
          Date.parse(selected.timestamp)) /
          1000,
      )
    : 0;
  const envelope = selected ? searchEstimate([selected], stale) : null;
  return (
    <div className="page rescue-map-page">
      <div className="console-toolbar">
        <SiteSwitcher />
        <div className="console-counters">
          <span>
            <strong>
              {
                incidents.filter(
                  (incident) => !CLOSED_STATUSES.has(incident.status),
                ).length
              }
            </strong>{" "}
            open
          </span>
          <span>
            <strong>
              {teams.filter((team) => team.status === "available").length}
            </strong>{" "}
            teams ready
          </span>
          <span className={connection === "realtime" ? "live" : ""}>
            {syncedAt ? "Live" : "Connecting"}
          </span>
        </div>
      </div>
      <div className="segmented">
        {[
          ["response", "Response"],
          ["visitors", "Visitor monitoring"],
          ["contributions", "Route review"],
          ["activity", "Activity"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {user.demo && <ScenarioControl />}
      {tab === "contributions" ? (
        <Contributions />
      ) : tab === "activity" ? (
        <section className="panel">
          {state.audit.map((a) => (
            <div className="audit-row" key={a.id}>
              <strong>{a.action.replaceAll("_", " ")}</strong>
              <span>{a.site}</span>
              <time>{new Date(a.timestamp).toLocaleString()}</time>
            </div>
          ))}
        </section>
      ) : (
        <>
          <div className="response-layout">
            <section className="map-card">
              <div className="map-topline">
                <strong>
                  {teamPick
                    ? "Click map to update selected team position"
                    : `${site.name} · response map`}
                </strong>
              </div>
              <WaterMap
                dark
                heatmap
                search={envelope}
                onMapPosition={
                  teamPick
                    ? (p) => {
                        act("team_position", {
                          team_id: teamPick,
                          lng: p[0],
                          lat: p[1],
                        });
                        setTeamPick(null);
                      }
                    : undefined
                }
              />
            </section>
            <section className="panel">
              {tab === "visitors" ? (
                <>
                  <h2>Visitor monitoring</h2>
                  <p className="compact">
                    Click a visitor marker for name and age. A stale location is
                    a last-known position, not proof a phone is switched off.
                  </p>
                  <div className="visitor-list">
                    {visitors.map((v) => (
                      <button
                        className="route-option"
                        key={v.id}
                        onClick={() => setSelected(v)}
                      >
                        <span>
                          <strong>{v.name}</strong>
                          <small>
                            {v.age ?? "Age not provided"} ·{" "}
                            {v.source === "simulation"
                              ? "Simulated track"
                              : new Date(v.timestamp).toLocaleTimeString()}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {selected && (
                    <div className="assigned-team">
                      <h3>
                        {selected.name} · {selected.age ?? "Age not provided"}
                      </h3>
                      <p>
                        Last position: {selected.lat.toFixed(5)},{" "}
                        {selected.lng.toFixed(5)}
                      </p>
                      <small>
                        {selected.source === "simulation"
                          ? "Historical replay; no device status available"
                          : `${Math.round(stale)} seconds since update`}
                      </small>
                      <p>
                        Blue envelope shows bounded uncertainty, not a predicted
                        location.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>Help requests</h2>
                  {!incidents.length && (
                    <p>
                      No requests yet. Join this drill as a tourist using the
                      same code and send Help / SOS.
                    </p>
                  )}
                  {incidents.map((i) => (
                    <article className="incident-card" key={i.id}>
                      <div className="panel-head">
                        <strong>
                          {i.name || "Visitor"} {i.age ? `· ${i.age}` : ""}
                        </strong>
                        <span className="pill">
                          {i.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p>{i.note}</p>
                      <small>
                        {new Date(i.created_at).toLocaleString()} · {i.zone}{" "}
                        zone
                      </small>
                      {i.status === "active" && (
                        <div className="team-recommendations">
                          {rankRescueTeams(i, teams)
                            .filter((team) => team.status === "available")
                            .map((team, index) => (
                              <div
                                className="team-recommendation"
                                key={team.id}
                              >
                                <div>
                                  <strong>
                                    {index === 0 ? "Recommended · " : ""}
                                    {team.name}
                                  </strong>
                                  <small>
                                    Score {team.recommendation_score}/100
                                    {team.eta_min
                                      ? ` · approximate ETA ${team.eta_min} min`
                                      : " · ETA unavailable"}
                                  </small>
                                  <p>
                                    {team.recommendation_reasons.join(" · ")}
                                  </p>
                                </div>
                                <button
                                  className="button"
                                  disabled={busy}
                                  onClick={() =>
                                    act("assign", {
                                      id: i.id,
                                      team_id: team.id,
                                    })
                                  }
                                >
                                  Dispatch
                                </button>
                              </div>
                            ))}
                          {!teams.some((t) => t.status === "available") && (
                            <p>No available team. Register a team below.</p>
                          )}
                        </div>
                      )}
                      {i.status === "dispatched" && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => act("arrive", { team_id: i.team_id })}
                        >
                          Mark team on scene
                        </button>
                      )}
                      {i.status === "on_scene" && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => act("resolve", { id: i.id })}
                        >
                          Complete rescue
                        </button>
                      )}
                    </article>
                  ))}
                </>
              )}
            </section>
          </div>
          {tab === "response" && (
            <div className="response-layout">
              <section className="panel">
                <h2>Rescue teams</h2>
                {teams.map((t) => (
                  <div key={t.id} className="team-row">
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.status.replaceAll("_", " ")}
                        {t.eta_min ? ` · ETA ${t.eta_min} min` : ""}
                      </small>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => setTeamPick(t.id)}
                    >
                      Update location on map
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        navigator.geolocation.getCurrentPosition(
                          (p) =>
                            act("team_position", {
                              team_id: t.id,
                              lng: p.coords.longitude,
                              lat: p.coords.latitude,
                            }),
                          (e) => notify(e.message),
                        )
                      }
                    >
                      Use device GPS
                    </button>
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act("register_team", {
                      name: f.get("name"),
                      lng: site.center[0],
                      lat: site.center[1],
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <label>
                    Register a team
                    <input
                      name="name"
                      required
                      placeholder="Team name"
                      maxLength={80}
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Add team at site centre
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>Site advisory</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("message", { zone: "all", text: message });
                    setMessage("");
                  }}
                >
                  <label>
                    Message to visitors
                    <textarea
                      required
                      maxLength={1000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe the affected area and action to take"
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Publish site advisory
                  </button>
                </form>
              </section>
            </div>
          )}
          {user.demo && <ReplayBar />}
        </>
      )}
    </div>
  );
}
