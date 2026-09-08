import { useEffect, useRef, useState } from "react";
import { Map, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Maximize, Layers } from "lucide-react";
import { useWater } from "../store/water-context";
import SurveyMap from "./SurveyMap";
setWorkerUrl(mapWorkerUrl);
const fc = (features) => ({ type: "FeatureCollection", features });
const point = (coordinates, properties) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties,
});
export default function WaterMap({
  selectedRoute,
  onRouteSelect,
  dark = false,
  route = null,
  search = null,
  heatmap = false,
  showPeople = true,
  onMapPosition,
  positionOverride,
}) {
  const {
    site,
    features,
    people,
    position: contextPosition,
    locate,
    offlineDemo,
    online,
    state,
  } = useWater();
  const position = positionOverride || contextPosition;
  const [fallback, setFallback] = useState(false);
  const container = useRef(null),
    mapRef = useRef(null),
    props = useRef({});
  const [error, setError] = useState(false),
    [survey, setSurvey] = useState(false);
  useEffect(() => {
    props.current = {
      features,
      people,
      position,
      site,
      selectedRoute,
      onRouteSelect,
      route,
      search,
      heatmap,
      showPeople,
      state,
      onMapPosition,
    };
  }, [
    features,
    people,
    position,
    site,
    selectedRoute,
    onRouteSelect,
    route,
    search,
    heatmap,
    showPeople,
    state,
    onMapPosition,
  ]);
  function sync() {
    const map = mapRef.current;
    if (!map?.getSource("site")) return;
    const p = props.current;
    map.getSource("site").setData(p.features);
    map
      .getSource("people")
      .setData(
        fc(
          p.showPeople
            ? p.people.map((u) => point([u.lng, u.lat], { ...u, name: u.id }))
            : [],
        ),
      );
    map
      .getSource("position")
      .setData(
        fc(p.position ? [point(p.position, { name: "Current position" })] : []),
      );
    map
      .getSource("selected")
      .setData(
        fc(
          p.route
            ? [{ type: "Feature", geometry: p.route, properties: {} }]
            : p.features.features.filter(
                (f) => f.properties.id === p.selectedRoute,
              ),
        ),
      );
    map.getSource("search").setData(fc(p.search ? [p.search] : []));
    map
      .getSource("crowd")
      .setData(fc(p.site.crowd.map((c) => point([c.lng, c.lat], c))));
    map
      .getSource("incidents")
      .setData(
        fc(
          p.state.incidents
            .filter(
              (i) =>
                i.site === p.site.id &&
                !["cancelled", "resolved"].includes(i.status),
            )
            .map((i) =>
              point([i.lng, i.lat], { ...i, name: `SOS · ${i.status}` }),
            ),
        ),
      );
    map.setLayoutProperty(
      "crowd-heat",
      "visibility",
      p.heatmap ? "visible" : "none",
    );
  }
  useEffect(() => {
    let map;
    // External WebGL initialization can fail once; update the fallback view.
    // oxlint-disable-next-line react/set-state-in-effect
    try {
      map = new Map({
        container: container.current,
        center: site.center,
        zoom: site.zoom,
        attributionControl: true,
        style: {
          version: 8,
          sources: {
            streets: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": dark ? "#173544" : "#e9eee9" },
            },
            {
              id: "streets",
              type: "raster",
              source: "streets",
              paint: {
                "raster-opacity": dark ? 0.38 : 0.78,
                "raster-saturation": -0.65,
              },
            },
          ],
        },
      });
    } catch {
      // WebGL is an external capability; surface its initialization failure once.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(true);
      setFallback(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("error", () => setError(true));
    map.on("load", () => {
      for (const name of [
        "site",
        "people",
        "position",
        "selected",
        "search",
        "crowd",
        "incidents",
      ])
        map.addSource(name, { type: "geojson", data: fc([]) });
      const category = (c) => ["==", ["get", "category"], c];
      const polygons = ["==", ["geometry-type"], "Polygon"];
      map.addLayer({
        id: "study-fill",
        type: "fill",
        source: "site",
        filter: ["all", polygons, category("boundary")],
        paint: { "fill-color": "#2aafa1", "fill-opacity": 0.035 },
      });
      map.addLayer({
        id: "study-line",
        type: "line",
        source: "site",
        filter: ["all", polygons, category("boundary")],
        paint: {
          "line-color": dark ? "#7dabb4" : "#6a9795",
          "line-width": 1.3,
          "line-dasharray": [4, 4],
          "line-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "water-lines",
        type: "line",
        source: "site",
        filter: category("water"),
        paint: {
          "line-color": dark ? "#62a4ba" : "#73a7b5",
          "line-width": 2.5,
          "line-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "hazard-fill",
        type: "fill",
        source: "site",
        filter: ["all", polygons, category("hazard")],
        paint: {
          "fill-color": [
            "match",
            ["get", "level"],
            "high",
            "#d7505c",
            "medium",
            "#d49b3f",
            "#4b8bc5",
          ],
          "fill-opacity": dark ? 0.23 : 0.05,
        },
      });
      map.addLayer({
        id: "hazard-line",
        type: "line",
        source: "site",
        filter: ["all", polygons, category("hazard")],
        paint: {
          "line-color": dark ? "#df6f78" : "#b68968",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });
      map.addLayer({
        id: "routes-outline",
        type: "line",
        source: "site",
        filter: category("route"),
        paint: {
          "line-color": dark ? "#12323c" : "#ffffff",
          "line-width": 5,
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "site",
        filter: category("route"),
        paint: {
          "line-color": dark ? "#44b6a5" : "#228e83",
          "line-width": 2,
          "line-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "restricted",
        type: "line",
        source: "site",
        filter: category("restricted_route"),
        paint: {
          "line-color": "#7b8890",
          "line-width": 1.5,
          "line-dasharray": [2, 3],
        },
      });
      map.addLayer({
        id: "selected-route-outline",
        type: "line",
        source: "selected",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#fff", "line-width": 8, "line-opacity": 0.75 },
      });
      map.addLayer({
        id: "selected-route",
        type: "line",
        source: "selected",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#087e77", "line-width": 4 },
      });
      map.addLayer({
        id: "landmarks",
        type: "circle",
        source: "site",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "match",
            ["get", "category"],
            "candidate",
            7,
            "facility",
            5,
            "terrain",
            0,
            3,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "candidate",
            "#209985",
            "facility",
            "#698da6",
            "#849b91",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": dark ? "#183340" : "#fff",
        },
      });
      map.addLayer({
        id: "people-halo",
        type: "circle",
        source: "people",
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "match",
            ["get", "role"],
            "team",
            "#498bdb",
            "#dcaa52",
          ],
          "circle-opacity": 0.15,
        },
      });
      map.addLayer({
        id: "people-pins",
        type: "circle",
        source: "people",
        paint: {
          "circle-radius": ["match", ["get", "role"], "team", 5, 3.5],
          "circle-color": [
            "match",
            ["get", "role"],
            "team",
            "#498bdb",
            "#bb8539",
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "crowd-heat",
        type: "heatmap",
        source: "crowd",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            0,
            0,
            120,
            1,
          ],
          "heatmap-radius": 35,
          "heatmap-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "search-envelope",
        type: "fill",
        source: "search",
        paint: { "fill-color": "#60a7f2", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "search-border",
        type: "line",
        source: "search",
        paint: {
          "line-color": "#60a7f2",
          "line-width": 2,
          "line-dasharray": [3, 3],
        },
      });
      map.addLayer({
        id: "current-halo",
        type: "circle",
        source: "position",
        paint: {
          "circle-color": "#438cd7",
          "circle-radius": 17,
          "circle-opacity": 0.17,
        },
      });
      map.addLayer({
        id: "current-pin",
        type: "circle",
        source: "position",
        paint: {
          "circle-color": "#307ac7",
          "circle-radius": 6,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "sos-pins",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-color": "#ff526b",
          "circle-radius": 9,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      sync();
    });
    map.on("click", (e) => {
      if (props.current.onMapPosition) {
        props.current.onMapPosition([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      if (!map.getLayer("routes")) return;
      const results = map.queryRenderedFeatures(e.point, {
        layers: ["landmarks", "routes", "people-pins", "sos-pins"],
      });
      const f = results[0];
      if (!f) return;
      if (f.layer.id === "routes") {
        props.current.onRouteSelect?.(f.properties.id);
        return;
      }
      const node = document.createElement("div"),
        strong = document.createElement("strong"),
        small = document.createElement("small");
      strong.textContent = f.properties.name || f.properties.id;
      small.textContent = f.properties.role
        ? "Simulated GPS · not a real person"
        : f.layer.id === "sos-pins"
          ? "Demo SOS · no external dispatch"
          : "User-mapped / candidate · requires verification";
      node.append(strong, small);
      new Popup({ offset: 12 })
        .setLngLat(e.lngLat)
        .setDOMContent(node)
        .addTo(map);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [site.id, site.center, site.zoom, dark]);
  useEffect(() => {
    sync();
  }, [
    features,
    people,
    position,
    selectedRoute,
    route,
    search,
    heatmap,
    showPeople,
    state,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const set = () => {
      if (map.getLayer("streets"))
        map.setLayoutProperty(
          "streets",
          "visibility",
          survey || offlineDemo || !online ? "none" : "visible",
        );
    };
    if (map.isStyleLoaded()) set();
    else map.once("load", set);
    return () => map.off("load", set);
  }, [survey, offlineDemo, online, site.id]);
  return (
    <div className="map-wrap">
      {fallback && (
        <SurveyMap
          site={site}
          features={features}
          selectedRoute={selectedRoute}
          onRouteSelect={onRouteSelect}
          route={route}
          position={position}
          people={showPeople ? people : []}
          incidents={state.incidents.filter(
            (i) =>
              i.site === site.id &&
              !["resolved", "cancelled"].includes(i.status),
          )}
          dark={dark}
        />
      )}
      <div
        className="map-canvas"
        ref={container}
        role="region"
        aria-label={`${site.name} interactive map`}
      />
      {(error || offlineDemo || !online) && (
        <div className="map-note">
          {error ? "Street tiles unavailable. " : ""}Survey layers remain
          available. Locations and routes need field verification.
        </div>
      )}
      <div className="map-controls">
        <button
          className="icon-button"
          title="Use my location"
          aria-label="Use my location"
          onClick={() => locate()}
        >
          <Crosshair size={18} />
        </button>
        <button
          className="icon-button"
          title="Reset map view"
          aria-label="Reset map view"
          onClick={() =>
            mapRef.current?.flyTo({
              center: site.center,
              zoom: site.zoom,
              duration: 500,
            })
          }
        >
          <Maximize size={17} />
        </button>
      </div>
      <div className="map-style-switch">
        <button
          className={!survey ? "active" : ""}
          onClick={() => setSurvey(false)}
        >
          Map
        </button>
        <button
          className={survey ? "active" : ""}
          onClick={() => setSurvey(true)}
        >
          <Layers size={12} /> Survey
        </button>
      </div>
    </div>
  );
}
