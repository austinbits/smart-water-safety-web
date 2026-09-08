import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldAlert,
  Phone,
  Radio,
  Navigation,
  CheckCircle2,
  WifiOff,
  Volume2,
  VolumeX,
  ArrowRight,
  Play,
} from "lucide-react";
import { useWater } from "../store/water-context";
import { SiteSwitcher, PageHeading, Footer } from "../components/Shared";
import WaterMap from "../components/WaterMap";
import { planRoute } from "../../../shared/engine.mjs";
export default function EmergencyPage() {
  const {
    site,
    siteId,
    state,
    features,
    position,
    notify,
    dispatch,
    offlineDemo,
    setOfflineDemo,
    pending,
    emergency,
    startEmergency,
    cancelEmergency,
    clearEmergency,
    countdown,
  } = useWater();
  const [level, setLevel] = useState("high"),
    [voice, setVoice] = useState(false),
    [route, setRoute] = useState(null);
  const current = emergency?.site === siteId ? emergency : null,
    incident = state.incidents.find((i) => i.id === current?.id),
    closed = incident && ["resolved", "cancelled"].includes(incident.status);
  const active =
    current &&
    ["countdown", "active", "awareness"].includes(current.status) &&
    !closed;
  const messages = state.messages
    .filter(
      (m) =>
        m.site === siteId &&
        (m.zone === "all" || m.zone === (current?.zone || level)),
    )
    .slice(-5);
  const team = state.teams.find((t) => t.id === incident?.team_id);
  useEffect(() => {
    if (!voice || !active || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = `This is a demonstration. ${current.zone} risk zone. Keep away from the water. Follow local responder guidance.`;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    return () => window.speechSynthesis.cancel();
  }, [voice, active, current?.zone]);
  function plan() {
    const r = planRoute(site, current?.position || position, { features });
    setRoute({ ...r, features });
    if (!r.available) notify(r.reason);
  }
  async function resolve() {
    try {
      await dispatch("resolve", { id: incident.id, site: siteId });
      notify("Demo incident resolved. The assigned team is available again.");
      clearEmergency();
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <div className="page emergency-page">
      <PageHeading
        eyebrow="EMERGENCY RESPONSE"
        title={
          active
            ? "Stay calm. Keep away from the water."
            : "Be ready before it becomes urgent."
        }
        description="Rehearse the response. Know how to reach real emergency assistance."
      >
        <button
          className="icon-button"
          aria-label={
            voice ? "Turn voice guidance off" : "Turn voice guidance on"
          }
          onClick={() => setVoice(!voice)}
        >
          {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
      </PageHeading>
      <SiteSwitcher />
      <div className="emergency-layout">
        <div className="stack">
          <section
            className={`emergency-status ${active ? current.zone || "high" : "standby"}`}
          >
            <div className="row spread">
              <span className="pill">DEMONSTRATION · NO EXTERNAL DISPATCH</span>
              <ShieldAlert size={28} />
            </div>
            {active ? (
              <>
                <div className="emergency-word">
                  {current.zone.toUpperCase()} RISK ZONE
                </div>
                <p>
                  {current.zone === "low"
                    ? "Awareness alert. Monitor conditions and keep clear of the water."
                    : "Move away from the water. Follow local responder instructions."}
                </p>
                <div className="emergency-countdown-row">
                  {current.status === "countdown" ? (
                    <>
                      <div
                        className="countdown"
                        style={{ "--progress": `${(countdown / 30) * 100}%` }}
                      >
                        <strong>{countdown}</strong>
                        <span>SECONDS</span>
                      </div>
                      <div>
                        <h3>Demo SOS escalation</h3>
                        <p>
                          Cancel this drill before the timer ends, or let it
                          enter the rescue queue.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() =>
                            cancelEmergency().catch((e) => notify(e.message))
                          }
                        >
                          Cancel demo SOS
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="sos-confirmation">
                      <CheckCircle2 size={33} />
                      <div>
                        <h3>
                          {current.status === "awareness"
                            ? "Awareness only · no automatic SOS"
                            : pending.some((p) => p.eventId === current.id)
                              ? "SOS queued on this device"
                              : "Demo SOS in rescue queue"}
                        </h3>
                        <p>
                          {team
                            ? `${team.name} · ${team.status.replaceAll("_", " ")}`
                            : "No real rescue team or helpline has been contacted."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {incident && !closed && (
                  <div className="row">
                    <button
                      className="button secondary"
                      onClick={() =>
                        cancelEmergency().catch((e) => notify(e.message))
                      }
                    >
                      Cancel incident
                    </button>
                    <button className="button" onClick={resolve}>
                      <CheckCircle2 size={18} />
                      Mark demo resolved
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="emergency-word small">
                  READY WHEN IT MATTERS.
                </div>
                <p>
                  Run a controlled drill to see zone-specific alerts, the
                  cancellation window and rescue coordination.
                </p>
                <div className="drill-controls">
                  <div className="segmented">
                    {["low", "medium", "high"].map((l) => (
                      <button
                        key={l}
                        className={level === l ? "active" : ""}
                        aria-pressed={level === l}
                        onClick={() => setLevel(l)}
                      >
                        {l.charAt(0).toUpperCase() + l.slice(1)} zone
                      </button>
                    ))}
                  </div>
                  <button
                    className="button danger"
                    onClick={() => startEmergency(level)}
                  >
                    <Play size={18} />
                    Start emergency drill
                  </button>
                </div>
              </>
            )}
          </section>
          <section className="map-card">
            <div className="map-topline">
              <div className="map-title">
                <Navigation size={18} />
                Evacuation planning
              </div>
              <span className="pill">CANDIDATE PATHS</span>
            </div>
            <WaterMap
              dark
              route={
                route?.available && route.features === features
                  ? route.geometry
                  : null
              }
              positionOverride={current?.position}
            />
            <div className="evacuation-bottom">
              {route ? (
                <>
                  <div>
                    <h3>
                      {route.available
                        ? route.destination
                        : "No validated path through this area"}
                    </h3>
                    <p>
                      {route.available
                        ? `${route.distance_m} m · ${route.duration_min} min estimate · ${route.start_gap_m} m start gap · ${route.end_gap_m} m destination gap`
                        : route.reason}
                    </p>
                  </div>
                  {route.available && (
                    <span className="pill caution">FIELD CHECK REQUIRED</span>
                  )}
                </>
              ) : (
                <div>
                  <h3>Use the mapped pedestrian network</h3>
                  <p>
                    High-risk zones and railway tracks are excluded. Unknown
                    connections are never drawn as safe shortcuts.
                  </p>
                </div>
              )}
              <button className="button secondary" onClick={plan}>
                <Navigation size={15} />
                Calculate planning route
              </button>
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="panel emergency-call">
            <div className="call-icon">
              <Phone size={24} />
            </div>
            <h2>Real emergency?</h2>
            <p>
              Call India’s emergency response number for police, fire or medical
              assistance.
            </p>
            <a className="button danger full" href="tel:112">
              <Phone size={20} />
              Call 112
            </a>
            <a
              href="https://112.gov.in/"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Official emergency service
              <ArrowRight size={13} />
            </a>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Connection fallback</h2>
              <WifiOff size={18} />
            </div>
            <p className="compact muted">
              Rehearse loss of connectivity. Demo SOS actions stay on this
              device and sync after reconnecting.
            </p>
            <label className="toggle-row">
              <span>Simulate no internet</span>
              <input
                type="checkbox"
                checked={offlineDemo}
                onChange={(e) => setOfflineDemo(e.target.checked)}
                role="switch"
              />
            </label>
            <div className="queue-count">
              <strong>{pending.length}</strong>
              <span>actions waiting to sync</span>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Zone coordination</h2>
              <Radio size={18} />
            </div>
            <span className="pill">
              {(current?.zone || level).toUpperCase()} ZONE · DEMO
            </span>
            <div className="message-feed">
              {messages.length ? (
                messages.map((m) => (
                  <article key={m.id}>
                    <strong>{m.sender}</strong>
                    <p>{m.text}</p>
                    <small>
                      {new Date(m.timestamp).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <Radio size={24} />
                  <p>
                    No demo instructions yet. Send an update from the rescue
                    console.
                  </p>
                </div>
              )}
            </div>
            <Link className="text-link" to="/dashboard">
              Open rescue console
              <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
      <Footer />
    </div>
  );
}
