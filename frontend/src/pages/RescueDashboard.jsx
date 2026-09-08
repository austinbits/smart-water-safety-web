import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio,
  Users,
  ShieldAlert,
  CheckCircle2,
  Send,
  Clock,
  MapPin,
  Download,
  LogIn,
  LogOut,
  Search,
  Activity,
  SignalZero,
  Navigation,
} from "lucide-react";
import { useWater } from "../store/water-context";
import {
  PageHeading,
  SiteSwitcher,
  ReplayBar,
  Footer,
  Badge,
  Modal,
} from "../components/Shared";
import WaterMap from "../components/WaterMap";
import Contributions from "../components/Contributions";
import { api, downloadJSON } from "../services/api";
import { classifyPosition, searchEstimate } from "../../../shared/engine.mjs";
const open = (i) => !["resolved", "cancelled"].includes(i.status);
export default function RescueDashboard() {
  const {
    site,
    siteId,
    state,
    dispatch,
    notify,
    people,
    features,
    connection,
    frame,
  } = useWater();
  const [tab, setTab] = useState("overview"),
    [filter, setFilter] = useState("active"),
    [selectedId, setSelectedId] = useState(null),
    [heatmap, setHeatmap] = useState(false),
    [message, setMessage] = useState(""),
    [zone, setZone] = useState("all");
  const [login, setLogin] = useState(false),
    [user, setUser] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false),
    [operational, setOperational] = useState(null);
  const [lostId, setLostId] = useState(""),
    [elapsed, setElapsed] = useState(120),
    [search, setSearch] = useState(null);
  const incidents = state.incidents.filter((i) => i.site === siteId),
    filtered = incidents.filter((i) =>
      filter === "active" ? open(i) : !open(i),
    );
  const selected = filtered.find((i) => i.id === selectedId) || filtered[0],
    teams = state.teams.filter((t) => t.site === siteId),
    visitors = people.filter((p) => p.role === "visitor");
  const occupancy = useMemo(
    () =>
      people
        .filter((p) => p.role === "visitor")
        .reduce(
          (a, v) => {
            const z = classifyPosition([v.lng, v.lat], features.features);
            a[z] = (a[z] || 0) + 1;
            return a;
          },
          { high: 0, medium: 0, low: 0, outside: 0 },
        ),
    [people, features],
  );
  const available = teams.filter((t) => t.status === "available");
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {});
  }, []);
  async function act(action, payload) {
    setBusy(true);
    try {
      await dispatch(action, { site: siteId, ...payload });
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
      setPassword("");
      setLogin(false);
      const overview = await api("/operator/overview");
      setOperational(overview);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e) {
    e.preventDefault();
    if (!message.trim()) return;
    if (await act("message", { text: message, zone })) {
      setMessage("");
      notify("Demo update added to this workspace’s zone channel.");
    }
  }
  function estimate() {
    const id = lostId || visitors[0]?.id;
    if (!id) return;
    const points = site.replay
      .slice(0, frame + 1)
      .flatMap((f) => f.filter((v) => v.id === id));
    setSearch(searchEstimate(points, elapsed));
    notify(
      "Search envelope uses last-seen position, capped walking speed and elapsed time. It is an uncertainty area, not an exact location.",
    );
  }
  return (
    <div className="page rescue-page">
      <PageHeading
        eyebrow="RESCUE OPERATIONS"
        title="A shared picture. A coordinated response."
        description={`${site.name} · demonstration control room`}
      >
        <button className="button secondary" aria-label={user ? 'Operator account' : 'Operator sign in'} onClick={() => setLogin(true)}>
          <LogIn size={17} />
          <span>{user ? "Operator account" : "Operator sign in"}</span>
        </button>
      </PageHeading>
      <SiteSwitcher />
      {user && (
        <div className="operator-banner">
          <ShieldAlert size={17} />
          <span>
            Signed in: {user.email} · {user.role.replaceAll("_", " ")}. You are
            viewing the demo workspace.
          </span>
          <button
            onClick={async () => {
              try {
                setOperational(await api("/operator/overview"));
              } catch (e) {
                notify(e.message);
              }
            }}
            className="text-link"
          >
            View operational status
          </button>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              await api("/auth/logout", { method: "POST", body: "{}" });
              setUser(null);
              setOperational(null);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
      {operational && (
        <section className="panel">
          <div className="panel-head">
            <h2>Authenticated operational data</h2>
            <button
              className="button secondary"
              onClick={() => setOperational(null)}
            >
              Close
            </button>
          </div>
          <p className="compact">
            {operational.incidents.length} operational incident records.
            Official dispatch, SMS and video transport are not connected.
          </p>
        </section>
      )}
      <div className="rescue-stats">
        {[
          {
            label: "Open demo incidents",
            value: incidents.filter(open).length,
            icon: ShieldAlert,
            color: "red",
          },
          {
            label: "Available teams",
            value: available.length,
            icon: Radio,
            color: "teal",
          },
          {
            label: "Simulated visitors",
            value: visitors.length,
            icon: Users,
            color: "blue",
          },
          {
            label: "High-zone occupancy",
            value: occupancy.high,
            icon: Activity,
            color: "amber",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div className={`rescue-stat ${color}`} key={label}>
            <div>
              <span>{label}</span>
              <strong>{String(value).padStart(2, "0")}</strong>
            </div>
            <Icon size={24} />
          </div>
        ))}
      </div>
      <div className="console-toolbar">
        <div className="console-tabs">
          {[
            ["overview", "Operations overview"],
            ["teams", "Team roster"],
            ["contributions", "Path contributions"],
            ["activity", "Activity log"],
          ].map(([id, l]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="console-status">
          <span className="status-dot" />
          {connection === "supabase"
            ? "PERSISTED IN SUPABASE"
            : connection === "server"
              ? "CONNECTED DEMO"
              : "DEVICE DEMO"}
        </span>
      </div>
      {tab === "overview" ? (
        <>
          <div className="console-layout">
            <section className="panel incident-panel">
              <div className="panel-head">
                <h2>SOS incident queue</h2>
                <Badge value="high">{incidents.filter(open).length} OPEN</Badge>
              </div>
              <div className="segmented">
                <button
                  className={filter === "active" ? "active" : ""}
                  onClick={() => setFilter("active")}
                >
                  Active
                </button>
                <button
                  className={filter === "closed" ? "active" : ""}
                  onClick={() => setFilter("closed")}
                >
                  Closed
                </button>
              </div>
              <div className="incident-list">
                {filtered.length ? (
                  filtered.map((i) => (
                    <button
                      className={`incident-item ${selected?.id === i.id ? "selected" : ""}`}
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                    >
                      <div className="row spread">
                        <strong>#{i.id.slice(0, 8).toUpperCase()}</strong>
                        <Badge value={i.zone}>{i.zone.toUpperCase()}</Badge>
                      </div>
                      <span>{i.status.replaceAll("_", " ")}</span>
                      <small>
                        <Clock size={12} />
                        {new Date(i.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · Simulation
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <CheckCircle2 size={30} />
                    <h3>
                      {filter === "active"
                        ? "No open incidents"
                        : "No closed incidents yet"}
                    </h3>
                    <p>Start a drill to rehearse the entire response.</p>
                    <Link className="button secondary" to="/emergency">
                      Run an emergency drill
                    </Link>
                  </div>
                )}
              </div>
              {selected && (
                <div className="incident-details">
                  <h3>Incident details</h3>
                  <p>
                    <MapPin size={13} />
                    {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                  </p>
                  <p>{selected.note}</p>
                  {open(selected) && (
                    <div className="stack">
                      {!selected.team_id ? (
                        <button
                          className="button full"
                          disabled={!available.length || busy}
                          onClick={() =>
                            act("assign", {
                              id: selected.id,
                              team_id: available[0]?.id,
                            })
                          }
                        >
                          <Navigation size={15} />
                          Assign {available[0]?.name || "team unavailable"}
                        </button>
                      ) : (
                        <div className="assigned-team">
                          <Radio size={17} />
                          {teams.find((t) => t.id === selected.team_id)?.name}
                        </div>
                      )}
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => act("resolve", { id: selected.id })}
                      >
                        <CheckCircle2 size={16} />
                        Resolve demo incident
                      </button>
                    </div>
                  )}
                  <button
                    className="text-link"
                    onClick={() =>
                      downloadJSON(`incident-${selected.id}.json`, {
                        ...selected,
                        provenance: "simulation",
                        audit: state.audit,
                      })
                    }
                  >
                    <Download size={13} />
                    Export incident log
                  </button>
                </div>
              )}
            </section>
            <section className="map-card console-map">
              <div className="map-topline">
                <div className="map-title">
                  <Radio size={17} />
                  Operations map
                </div>
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={heatmap}
                    onChange={(e) => setHeatmap(e.target.checked)}
                  />
                  Crowd layer
                </label>
              </div>
              <WaterMap dark heatmap={heatmap} search={search} />
              <div className="map-legend">
                <span>
                  <i className="legend-dot blue" />
                  Demo teams
                </span>
                <span>
                  <i className="legend-dot" />
                  Candidate refuges
                </span>
                <span>
                  <i className="legend-dash" />
                  Risk polygons
                </span>
              </div>
            </section>
          </div>
          <div className="console-lower">
            <section className="panel">
              <div className="panel-head">
                <h2>Rescue team roster</h2>
                <span className="pill">{teams.length} TEAM</span>
              </div>
              <TeamRoster teams={teams} act={act} busy={busy} />
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Zone coordination</h2>
                <Radio size={18} />
              </div>
              <div className="message-feed compact-feed">
                {state.messages
                  .filter((m) => m.site === siteId)
                  .slice(-3)
                  .map((m) => (
                    <article key={m.id}>
                      <strong>
                        {m.zone.toUpperCase()} ZONE · {m.sender}
                      </strong>
                      <p>{m.text}</p>
                    </article>
                  ))}
                {!state.messages.some((m) => m.site === siteId) && (
                  <p className="compact muted">
                    Demo messages appear here and in Emergency mode.
                  </p>
                )}
              </div>
              <form className="message-form" onSubmit={send}>
                <select
                  className="select"
                  aria-label="Recipient zone"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                >
                  {["all", "high", "medium", "low"].map((z) => (
                    <option key={z} value={z}>
                      {z === "all"
                        ? "All zones"
                        : z.charAt(0).toUpperCase() + z.slice(1) + " zone"}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Demo zone message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  placeholder="Write a demo update…"
                />
                <button
                  className="icon-button"
                  type="submit"
                  disabled={!message.trim() || busy}
                  aria-label="Send demo update"
                >
                  <Send size={18} />
                </button>
              </form>
            </section>
          </div>
          <div className="console-lower">
            <section className="panel">
              <div className="panel-head">
                <h2>Last-seen search estimate</h2>
                <SignalZero size={18} />
              </div>
              <p className="compact muted">
                Rehearse signal loss using a simulated visitor. The shaded area
                shows uncertainty, not a verified location prediction.
              </p>
              <div className="search-controls">
                <select
                  className="select"
                  aria-label="Simulated visitor"
                  value={lostId || visitors[0]?.id || ""}
                  onChange={(e) => setLostId(e.target.value)}
                >
                  {visitors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
                <label className="compact">
                  {elapsed / 60} min since last fix
                  <input
                    type="range"
                    min="60"
                    max="600"
                    step="60"
                    value={elapsed}
                    onChange={(e) => setElapsed(Number(e.target.value))}
                  />
                </label>
                <button className="button secondary" onClick={estimate}>
                  <Search size={15} />
                  Show search envelope
                </button>
                {search && (
                  <button className="text-link" onClick={() => setSearch(null)}>
                    Clear envelope
                  </button>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Zone occupancy</h2>
                <Users size={18} />
              </div>
              <div className="occupancy-list">
                {[
                  ["high", "High risk"],
                  ["medium", "Medium risk"],
                  ["low", "Low risk"],
                  ["outside", "Outside mapped hazard"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <div>
                      <i
                        style={{
                          width: `${((occupancy[key] || 0) / Math.max(visitors.length, 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{occupancy[key] || 0}</strong>
                  </div>
                ))}
              </div>
              <p className="source-note">
                Counts use point-in-polygon checks on the replay frame. They
                represent simulated visitors only.
              </p>
            </section>
          </div>
          <ReplayBar />
        </>
      ) : tab === "teams" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Team availability & assignments</h2>
            <Badge value="teal">SIMULATED ROSTER</Badge>
          </div>
          <TeamRoster teams={teams} act={act} busy={busy} />
          <p className="source-note">
            Assignments are restricted to a team at the same site. Resolving an
            incident releases its team.
          </p>
        </section>
      ) : tab === "contributions" ? (
        <Contributions />
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Workspace audit trail</h2>
            <button
              className="button secondary"
              onClick={() =>
                downloadJSON("water-safety-demo-audit.json", state.audit)
              }
            >
              <Download size={15} />
              Export
            </button>
          </div>
          <div className="audit-list">
            {state.audit.length ? (
              state.audit.map((a) => (
                <div key={a.id}>
                  <span className="audit-icon">
                    <Activity size={16} />
                  </span>
                  <div>
                    <strong>{a.action.replaceAll("_", " ")}</strong>
                    <small>
                      {a.site || "Workspace"} ·{" "}
                      {new Date(a.timestamp).toLocaleString("en-IN")}
                    </small>
                  </div>
                  <Badge>DEMO</Badge>
                </div>
              ))
            ) : (
              <div className="empty-state">
                Actions in this demo will appear here.
              </div>
            )}
          </div>
        </section>
      )}
      <Footer />
      {login && (
        <Modal
          title={user ? "Operator account" : "Operator sign in"}
          onClose={() => setLogin(false)}
        >
          {user ? (
            <p>
              {user.email} · {user.role}. The current demonstration is isolated
              from operational incident records.
            </p>
          ) : (
            <form onSubmit={signIn}>
              <p>
                Use your Supabase account with an administrator-assigned rescue
                or authority role. The demo console remains available without
                sign-in.
              </p>
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {loginError && (
                <p className="error-text" role="alert">
                  {loginError}
                </p>
              )}
              <button className="button full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in securely"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
function TeamRoster({ teams, act, busy }) {
  return (
    <div className="team-roster">
      {teams.map((t) => (
        <div className="team-row" key={t.id}>
          <span className="team-avatar">
            <Radio size={20} />
          </span>
          <div className="team-name">
            <strong>{t.name}</strong>
            <small>
              {t.members} members ·{" "}
              {t.incident_id
                ? `Assigned #${t.incident_id.slice(0, 8)}`
                : "Ready for assignment"}
            </small>
          </div>
          <Badge value={t.status === "available" ? "teal" : "medium"}>
            {t.status.replaceAll("_", " ").toUpperCase()}
          </Badge>
          {t.status === "en_route" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => act("arrive", { team_id: t.id })}
            >
              Mark on scene
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
