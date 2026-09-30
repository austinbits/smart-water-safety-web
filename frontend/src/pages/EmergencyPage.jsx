import { useRef, useState } from "react";
import { ShieldAlert, Phone, LocateFixed } from "lucide-react";
import { useWater } from "../store/water-context";
import { PageHeading, SiteSwitcher } from "../components/Shared";
import WaterMap from "../components/WaterMap";
import ZoneOutlook from "../components/ZoneOutlook";

const CLOSED_STATUSES = new Set(["resolved", "cancelled"]);

/** Create and follow a help request for the currently selected site. */
export default function EmergencyPage() {
  const {
    site,
    siteId,
    position,
    zone,
    locate,
    location,
    state,
    dispatch,
    notify,
    connection,
  } = useWater();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const requestId = useRef(crypto.randomUUID());
  // Prefer the open request, but keep the newest closed request for its status.
  const incident =
    state.incidents.find(
      (candidate) =>
        candidate.site === siteId && !CLOSED_STATUSES.has(candidate.status),
    ) || state.incidents.find((candidate) => candidate.site === siteId);
  const team = state.teams.find(
    (candidate) => candidate.id === incident?.team_id,
  );
  const closed = !incident || CLOSED_STATUSES.has(incident.status);

  /** Run one request action while keeping buttons disabled during delivery. */
  async function act(action, payload, id) {
    setBusy(true);
    try {
      await dispatch(action, payload, id);
      if (action === "cancel") requestId.current = crypto.randomUUID();
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="HELP & RESPONSE"
        title="You don’t have to face it alone."
        description="Your request and its status stay connected to the rescue dashboard."
      />
      <SiteSwitcher />
      <div className="response-layout">
        <section className="panel">
          <ShieldAlert size={32} />
          <h2>
            {closed
              ? "Need assistance?"
              : {
                  active: "Request received",
                  dispatched: "Rescue team accepted",
                  on_scene: "Rescue team is with you",
                }[incident.status]}
          </h2>
          <p>
            {location
              ? "Your GPS position will be sent with your request."
              : "Using a planning position. Enable GPS to share your actual location."}
          </p>
          <button className="button secondary" onClick={() => locate()}>
            <LocateFixed size={17} />
            Share my location
          </button>
          {closed ? (
            <>
              <label>
                What happened?
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Situation, number of people, nearby landmark"
                />
              </label>
              <button
                className="button danger full"
                disabled={busy}
                onClick={() => {
                  if (incident) requestId.current = crypto.randomUUID();
                  act(
                    "sos",
                    {
                      site: siteId,
                      lng: position[0],
                      lat: position[1],
                      zone,
                      note,
                    },
                    requestId.current,
                  );
                }}
              >
                {busy ? "Sending…" : "Send Help / SOS"}
              </button>
              {incident && (
                <p className="success-message">
                  Previous request: {incident.status.replace("_", " ")}
                </p>
              )}
            </>
          ) : (
            <>
              <ol className="response-steps">
                {[
                  "Request received",
                  "Team accepted",
                  "Team on scene",
                  "Rescue completed",
                ].map((t, i) => (
                  <li
                    key={t}
                    className={
                      i <=
                      ["active", "dispatched", "on_scene", "resolved"].indexOf(
                        incident.status,
                      )
                        ? "done"
                        : ""
                    }
                  >
                    {t}
                  </li>
                ))}
              </ol>
              {team && (
                <div className="assigned-team">
                  <h3>{team.name}</h3>
                  <strong>
                    {team.status === "on_scene"
                      ? "On scene"
                      : team.eta_min
                        ? `Estimated arrival: ${team.eta_min} min`
                        : "Waiting for team location"}
                  </strong>
                  <p>{team.eta_method}</p>
                  <small>
                    {team.updated_at
                      ? `Position updated ${new Date(team.updated_at).toLocaleTimeString()}`
                      : "No team position yet"}
                  </small>
                </div>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => act("cancel", { id: incident.id, site: siteId })}
              >
                Cancel my request
              </button>
            </>
          )}
          <p className="compact">
            {connection === "device"
              ? "Connection unavailable. Delivery requires server confirmation."
              : "Status refreshes every three seconds."}
          </p>
          <a className="button secondary full" href="tel:112">
            <Phone size={17} />
            Call 112
          </a>
          <p className="compact">
            Official emergency dispatch is not connected. LoRa and gateways are
            a future hardware integration.
          </p>
        </section>
        <section className="map-card">
          <div className="map-topline">
            <strong>{site.name} · your location & assigned team</strong>
          </div>
          <WaterMap dark />
        </section>
      </div>
      <ZoneOutlook />
    </div>
  );
}
