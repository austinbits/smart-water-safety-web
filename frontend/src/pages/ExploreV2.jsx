import { useMemo, useState, useEffect } from "react";
import { Navigation, MapPinned, LocateFixed } from "lucide-react";
import { useWater } from "../store/water-context";
import { SiteSwitcher, PageHeading, Footer } from "../components/Shared";
import WaterMap from "../components/WaterMap";
import ZoneOutlook from "../components/ZoneOutlook";
import {
  destinations,
  alternatives,
  routeProfile,
} from "../../../shared/navigation.mjs";
export default function ExplorePage() {
  const {
    site,
    siteId,
    features,
    position,
    locate,
    location,
    tracking,
    trace,
    stopTrace,
    dispatch,
    notify,
    admin,
  } = useWater();
  const [destination, setDestination] = useState(
      site.default_destination || "",
    ),
    [start, setStart] = useState(null),
    [picking, setPicking] = useState(false),
    [selected, setSelected] = useState(0),
    [dem, setDem] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`/data/elevation/${site.id}.json`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setDem(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [site.id]);
  const targets = useMemo(() => destinations(site), [site]);
  const result = useMemo(
    () =>
      alternatives(site, start || position, {
        features,
        destination: destination || undefined,
      }),
    [site, start, position, features, destination],
  );
  const route = result.routes[selected] || result.routes[0];
  const profile = useMemo(
    () => routeProfile(dem, route?.geometry),
    [dem, route],
  );
  const elevations = profile.map((p) => p.elevation).filter(Number.isFinite);
  return (
    <div className="page">
      <PageHeading
        eyebrow="EXPLORE WITH AWARENESS"
        title="Your destination. A considered path."
        description="Compare mapped walking options with local risk and real terrain."
      >
        <button
          className="button secondary"
          onClick={() => {
            setStart(null);
            locate();
          }}
        >
          <LocateFixed size={17} />
          Use my location
        </button>
      </PageHeading>
      <SiteSwitcher />
      <div className="explore-layout">
        <section className="map-card">
          <div className="map-topline">
            <MapPinned size={18} />
            <strong>{site.name}</strong>
            <span className="pill teal">3D TERRAIN</span>
          </div>
          <WaterMap
            route={route?.geometry}
            alternatives={result.blocked ? [result.blocked] : result.routes}
            onDestinationSelect={(id) => {
              setDestination(id);
              setSelected(0);
            }}
            positionOverride={start || position}
            onMapPosition={
              picking
                ? (p) => {
                    setStart(p);
                    setPicking(false);
                    setSelected(0);
                  }
                : undefined
            }
          />
          <div className="map-legend">
            <span>🟢 Lower risk</span>
            <span>🟠 Moderate / increasing</span>
            <span>🔴 Dangerous</span>
            <span>Terrain: Mapzen / SRTM</span>
          </div>
        </section>
        <aside className="route-panel">
          <section className="panel">
            <h2>Where would you like to go?</h2>
            <label>
              Destination
              <select
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setSelected(0);
                }}
              >
                <option value="">Nearest reachable candidate refuge</option>
                {targets.map((f) => (
                  <option key={f.properties.id} value={f.properties.id}>
                    {f.properties.name} · {f.properties.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary full"
              onClick={() => setPicking(!picking)}
            >
              {picking
                ? "Click your starting point on the map"
                : "Choose starting point on map"}
            </button>
            <p className="compact">
              {location && !start ? "Your GPS location" : "Planning position"} ·
              Click a destination marker to plan a visit
            </p>
            {result.routes.length ? (
              result.routes.map((r, i) => (
                <button
                  key={i}
                  className={`route-option ${r === route ? "selected" : ""}`}
                  onClick={() => setSelected(i)}
                >
                  <i
                    style={{
                      background: r.color,
                      width: 5,
                      alignSelf: "stretch",
                      borderRadius: 8,
                    }}
                  />
                  <span>
                    <strong>{r.label}</strong>
                    <small>{r.destination}</small>
                    <small>
                      {r.distance_m} m · {r.duration_min} min · {r.risk}
                    </small>
                  </span>
                  <Navigation size={17} />
                </button>
              ))
            ) : (
              <div className="inline-notice">
                <p>
                  {result.reason}
                  {result.blocked &&
                    " The red line shows the blocked connection for review. Do not follow it."}
                </p>
              </div>
            )}
            {route && (
              <div className="route-detail">
                <p>{route.warning}</p>
                <small>
                  Start gap: {route.start_gap_m} m. Destination gap:{" "}
                  {route.end_gap_m} m. Unverified gaps are not navigation
                  instructions.
                </small>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>Elevation along your route</h3>
            {elevations.length > 1 ? (
              <>
                <svg
                  className="elevation-chart"
                  viewBox="0 0 300 100"
                  role="img"
                  aria-label="Terrain elevation profile"
                >
                  <polyline
                    fill="none"
                    stroke="#168b78"
                    strokeWidth="3"
                    points={profile
                      .filter((p) => p.elevation !== null)
                      .map(
                        (p) =>
                          `${(p.meters / (profile.at(-1).meters || 1)) * 300},${90 - ((p.elevation - Math.min(...elevations)) / (Math.max(...elevations) - Math.min(...elevations) || 1)) * 75}`,
                      )
                      .join(" ")}
                  />
                </svg>
                <strong>
                  {Math.round(Math.min(...elevations))}–
                  {Math.round(Math.max(...elevations))} m
                </strong>
                <small> Regional elevation estimate</small>
              </>
            ) : (
              <p>Select a reachable route to see its terrain profile.</p>
            )}
            <p className="compact">
              Real regional DEM, not a surveyed trail surface. 3D exaggeration:
              1.5×. Hold right mouse button to rotate.
            </p>
          </section>
        </aside>
      </div>
      <ZoneOutlook />
      {!admin && (
        <section className="panel">
          <h3>Contribute a walking trace</h3>
          <p>
            With your consent, record your trip and submit it for admin review.
            It will not become a recommended route automatically.
          </p>
          <label>
            <input type="checkbox" required id="trace-consent" /> I consent to
            recording and sharing my GPS path for review.
          </label>
          <div className="action-row">
            <button
              className="button secondary"
              onClick={() => {
                if (!document.getElementById("trace-consent").checked) {
                  notify("Please confirm GPS recording consent first.");
                  return;
                }
                if (tracking) stopTrace();
                else locate(true);
              }}
            >
              {tracking ? "Stop recording" : "Start recording"}
            </button>
            <button
              className="button"
              disabled={trace.length < 2 || tracking}
              onClick={() =>
                dispatch("trace", {
                  site: siteId,
                  points: trace,
                  consent: true,
                })
                  .then(() => notify("Trace submitted for review."))
                  .catch((e) => notify(e.message))
              }
            >
              Submit {trace.length} points for review
            </button>
          </div>
        </section>
      )}
      <Footer />
    </div>
  );
}
