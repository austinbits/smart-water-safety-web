import { useMemo, useState, useEffect } from "react";
import {
  ChevronDown,
  LocateFixed,
  Navigation,
  Route,
  Search,
  X,
} from "lucide-react";
import { useWater } from "../store/water-context";
import { SiteSwitcher } from "../components/Shared";
import WaterMap from "../components/WaterMap";
import {
  destinations,
  alternatives,
  routeProfile,
} from "../../../shared/navigation.mjs";

/** Let visitors compare mapped destinations, routes, terrain, and local risk. */
export default function ExplorePage() {
  const { site, features, position, locate, location } = useWater();
  const [destination, setDestination] = useState(
    site.default_destination || "",
  );
  const [start, setStart] = useState(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState(0);
  const [elevationModel, setElevationModel] = useState(null);
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // Terrain is a separate, compact file so the main site bundle loads quickly.
  useEffect(() => {
    let alive = true;
    fetch(`/data/elevation/${site.id}.json`)
      .then((response) => response.json())
      .then((loadedElevationModel) => {
        if (alive) setElevationModel(loadedElevationModel);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [site.id]);
  // Route choices are recalculated only when their actual inputs change.
  const targets = useMemo(() => destinations(site), [site]);
  const result = useMemo(
    () =>
      alternatives(site, start || position, {
        features,
        destination: destination || undefined,
        elevationModel,
      }),
    [site, start, position, features, destination, elevationModel],
  );
  const route = result.routes[selected] || result.routes[0];
  const profile = useMemo(
    () => routeProfile(elevationModel, route?.geometry),
    [elevationModel, route],
  );
  const elevations = profile
    .map((profilePoint) => profilePoint.elevation)
    .filter(Number.isFinite);
  return (
    <div className="map-workspace">
      <section className="map-stage">
        <div className="map-searchbar">
          <Search size={18} />
          <select
            aria-label="Destination"
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value);
              setSelected(0);
              setPlannerOpen(true);
            }}
          >
            <option value="">Find the nearest reachable safe point</option>
            {targets.map((feature) => (
              <option key={feature.properties.id} value={feature.properties.id}>
                {feature.properties.name}
              </option>
            ))}
          </select>
          <SiteSwitcher />
        </div>
        {plannerOpen && (
          <aside className="map-planner">
            <div className="planner-title">
              <div>
                <span>ROUTE OPTIONS</span>
                <h1>{route?.destination || "Choose a destination"}</h1>
              </div>
              <button
                className="icon-button"
                onClick={() => setPlannerOpen(false)}
                aria-label="Close route panel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="start-controls">
              <button
                onClick={() => {
                  setStart(null);
                  locate();
                }}
              >
                <LocateFixed size={16} />
                {location && !start ? "Using your location" : "Use my location"}
              </button>
              <button
                className={picking ? "active" : ""}
                onClick={() => setPicking(!picking)}
              >
                {picking ? "Click the map…" : "Choose on map"}
              </button>
            </div>
            <div className="map-route-list">
              {result.routes.length ? (
                result.routes.map((candidate, index) => (
                  <button
                    key={candidate.label}
                    className={candidate === route ? "selected" : ""}
                    onClick={() => {
                      setSelected(index);
                      setNavigating(false);
                    }}
                  >
                    <i style={{ background: candidate.color }} />
                    <span>
                      <strong>{candidate.label}</strong>
                      <small>
                        {candidate.duration_min} min · {candidate.distance_m} m
                      </small>
                    </span>
                    <b>{candidate.safety_score}</b>
                  </button>
                ))
              ) : (
                <p className="route-empty">{result.reason}</p>
              )}
            </div>
            {route && (
              <>
                <button
                  className="route-details-toggle"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                >
                  Route details
                  <ChevronDown
                    className={detailsOpen ? "open" : ""}
                    size={17}
                  />
                </button>
                {detailsOpen && (
                  <div className="route-facts">
                    <span>
                      Climb <strong>{route.elevation_gain_m} m</strong>
                    </span>
                    <span>
                      Max slope <strong>{route.maximum_slope_percent}%</strong>
                    </span>
                    <span>
                      Crowd exposure <strong>{route.crowd_exposure}</strong>
                    </span>
                    <ul>
                      {route.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    {elevations.length > 1 && (
                      <svg
                        viewBox="0 0 300 70"
                        aria-label="Route elevation profile"
                      >
                        <polyline
                          fill="none"
                          stroke="#19a37f"
                          strokeWidth="3"
                          points={profile
                            .filter((point) => point.elevation !== null)
                            .map(
                              (point) =>
                                `${(point.meters / (profile.at(-1).meters || 1)) * 300},${65 - ((point.elevation - Math.min(...elevations)) / (Math.max(...elevations) - Math.min(...elevations) || 1)) * 55}`,
                            )
                            .join(" ")}
                        />
                      </svg>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        )}
        {!plannerOpen && (
          <button className="open-planner" onClick={() => setPlannerOpen(true)}>
            <Route size={18} /> Routes
          </button>
        )}
        <div className={picking ? "map-picking active" : "map-picking"}>
          {picking ? "Select your starting point" : ""}
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
        {route && (
          <div className="route-action-bar">
            <div className="route-score">
              <strong>{route.safety_score}</strong>
              <span>route score</span>
            </div>
            <div>
              <strong>{route.duration_min} min</strong>
              <span>
                {route.distance_m} m · {route.risk}
              </span>
            </div>
            <button onClick={() => setNavigating(!navigating)}>
              <Navigation size={18} />
              {navigating ? "End route" : "Start route"}
            </button>
          </div>
        )}
        {navigating && route && (
          <div className="navigation-banner">
            <Navigation size={20} /> Follow the highlighted path toward{" "}
            {route.destination}
          </div>
        )}
      </section>
    </div>
  );
}
