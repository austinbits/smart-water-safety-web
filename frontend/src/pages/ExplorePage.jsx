import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  MapPinned,
  Route,
  ChevronRight,
  ArrowUpRight,
  Navigation,
  Footprints,
  ShieldCheck,
  Check,
  Square,
  LocateFixed,
} from "lucide-react";
import { useWater } from "../store/water-context";
import {
  SiteSwitcher,
  PageHeading,
  ReplayBar,
  Footer,
  Modal,
} from "../components/Shared";
import WaterMap from "../components/WaterMap";
import { lineDistance } from "../../../shared/engine.mjs";
const distanceLabel = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
export default function ExplorePage() {
  const {
    site,
    siteId,
    features,
    locate,
    location,
    tracking,
    trace,
    stopTrace,
    savedSites,
    saveOffline,
    dispatch,
    notify,
  } = useWater();
  const [selectedId, setSelectedId] = useState(null),
    [modal, setModal] = useState(null),
    [consent, setConsent] = useState(false),
    [preview, setPreview] = useState(false);
  const routes = useMemo(
    () =>
      features.features
        .filter((f) => f.properties.category === "route")
        .sort((a, b) => a.properties.distance_m - b.properties.distance_m),
    [features],
  );
  const selected =
    routes.find((r) => r.properties.id === selectedId) ||
    routes.find((r) => r.properties.distance_m > 250) ||
    routes[0];
  const p = selected?.properties;
  function name(r) {
    const n = r.properties.name;
    return /^p\d+$/i.test(n)
      ? `Mapped path ${n.slice(1)}`
      : n === "Untitled path"
        ? `Riverbank path ${routes.indexOf(r) + 1}`
        : n.charAt(0).toUpperCase() + n.slice(1);
  }
  async function submit() {
    try {
      await dispatch("trace", { site: siteId, points: trace, consent: true });
      notify(
        "Trace submitted for review. It will not be published as a verified route automatically.",
      );
      setModal(null);
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="EXPLORE WITH AWARENESS"
        title="A little preparation. A safer journey."
        description="Know the paths, understand the water, and stay connected."
      >
        <button className="button secondary" aria-label="Use my location" onClick={() => locate()}>
          <LocateFixed size={17} />
          <span>Use my location</span>
        </button>
      </PageHeading>
      <SiteSwitcher />
      <div className="explore-layout">
        <div>
          <section className="map-card">
            <div className="map-topline">
              <div className="map-title">
                <MapPinned size={17} />
                {site.name}
                <span className="pill teal">MAPPED</span>
              </div>
              <small>
                {site.center[1].toFixed(4)}° N · {site.center[0].toFixed(4)}° E
              </small>
            </div>
            <WaterMap
              selectedRoute={selected?.properties.id}
              onRouteSelect={(id) => {
                setSelectedId(id);
                setPreview(false);
              }}
            />
            <div className="map-legend">
              <span>
                <i className="legend-line" />
                Mapped paths
              </span>
              <span>
                <i className="legend-dash" />
                Hazard boundaries
              </span>
              <span>
                <i className="legend-dot" />
                Candidate refuge
              </span>
              <span>
                <i className="legend-dot blue" />
                {location ? "Your position" : "Demo position"}
              </span>
            </div>
          </section>
          <div className="explore-bottom">
            <div className="info-tile">
              <Footprints size={23} />
              <div>
                <h3>Leave a trail. Help the next visitor.</h3>
                <p>
                  Opt in to record your route. Each contribution helps improve
                  the map.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    if (tracking) {
                      stopTrace();
                      setModal("submit");
                    } else {
                      setConsent(false);
                      setModal("trace");
                    }
                  }}
                >
                  {tracking ? (
                    <>
                      <Square size={13} />
                      Stop recording · {trace.length} points
                    </>
                  ) : (
                    <>
                      Contribute a trip <ArrowUpRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="info-tile">
              <ShieldCheck size={23} />
              <div>
                <h3>Check conditions before you go.</h3>
                <p>
                  Rainfall, river flow and waves can change the visit. Get the
                  site-specific outlook.
                </p>
                <Link className="text-link" to="/forecast">
                  View water forecast <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <aside className="route-panel">
          <section className="panel">
            <div className="panel-head">
              <h2>Explore the paths</h2>
              <span className="pill">{routes.length} mapped</span>
            </div>
            <div className="route-list">
              {routes.map((r, i) => (
                <button
                  key={r.properties.id}
                  className={`route-option ${selected?.properties.id === r.properties.id ? "selected" : ""}`}
                  aria-pressed={selected?.properties.id === r.properties.id}
                  onClick={() => {
                    setSelectedId(r.properties.id);
                    setPreview(false);
                  }}
                >
                  <span className="route-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{name(r)}</strong>
                    <small>
                      {distanceLabel(r.properties.distance_m)} ·{" "}
                      {r.properties.duration_min} min ·{" "}
                      {r.properties.difficulty}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            {selected && (
              <div className="route-detail">
                <span className="pill teal">
                  <Route size={12} /> YOUR KML · ORIGINAL GEOMETRY
                </span>
                <div className="route-stats">
                  <div>
                    <strong>{distanceLabel(p.distance_m)}</strong>
                    <small>Path length</small>
                  </div>
                  <div>
                    <strong>{p.duration_min} min</strong>
                    <small>Walking estimate</small>
                  </div>
                </div>
                <p>
                  {preview
                    ? "The highlighted line follows your mapped path. Follow local restrictions; no turn-by-turn safety clearance is implied."
                    : "User-mapped path. Access and safety need on-site verification."}
                </p>
                <button
                  className="button full"
                  onClick={() => setPreview(!preview)}
                >
                  <Navigation size={16} />
                  {preview ? "Close path preview" : "Preview mapped path"}
                </button>
              </div>
            )}
          </section>
          <section className="panel download-panel">
            <Download size={25} />
            <h3>Take the map with you.</h3>
            <p>
              Keep mapped paths and candidate refuges available when the signal
              disappears.
            </p>
            <button className="button secondary" onClick={saveOffline}>
              {savedSites.includes(siteId) ? (
                <Check size={16} />
              ) : (
                <Download size={16} />
              )}{" "}
              {savedSites.includes(siteId)
                ? "Update offline bundle"
                : "Save offline bundle"}
            </button>
            <div className="download-meta">
              <span>Vector layers + site data</span>
              <span>On this device</span>
            </div>
          </section>
        </aside>
      </div>
      <ReplayBar />
      <Footer />
      {modal === "trace" && (
        <Modal title="Contribute your trip" onClose={() => setModal(null)}>
          <p>
            Record GPS points on this device while this page is open. You choose
            whether to submit the path when you finish. Your name and account
            details are not included.
          </p>
          <p>
            Precise path geometry can still reveal a visit. Only submit a route
            you’re comfortable sharing for review. Closing the browser stops
            recording.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I consent to GPS recording for this trip.
          </label>
          <button
            className="button full"
            disabled={!consent}
            onClick={() => {
              locate(true);
              setModal(null);
            }}
          >
            <Footprints size={17} />
            Start recording
          </button>
        </Modal>
      )}
      {modal === "submit" && (
        <Modal title="Your trip contribution" onClose={() => setModal(null)}>
          <div className="route-stats">
            <div>
              <strong>{trace.length}</strong>
              <small>GPS points</small>
            </div>
            <div>
              <strong>{distanceLabel(lineDistance(trace))}</strong>
              <small>Recorded distance</small>
            </div>
          </div>
          <p>
            Submissions enter a review queue. Popularity alone does not make a
            route safe.
          </p>
          <button
            className="button full"
            disabled={trace.length < 2}
            onClick={submit}
          >
            Submit for review
          </button>
          {trace.length < 2 && (
            <p className="compact">
              Move with recording enabled to capture at least two points.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
