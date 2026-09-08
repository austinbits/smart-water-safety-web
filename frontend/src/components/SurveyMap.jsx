import { useMemo } from "react";

// SVG keeps the original survey visible on devices without WebGL.
export default function SurveyMap({
  site,
  features,
  selectedRoute,
  onRouteSelect,
  route,
  position,
  people = [],
  incidents = [],
  dark = false,
}) {
  const view = useMemo(() => {
    const points = [];
    const collect = (c) => {
      if (typeof c[0] === "number") points.push(c);
      else c.forEach(collect);
    };
    features.features
      .filter((f) => f.properties.category !== "terrain")
      .forEach((f) => collect(f.geometry.coordinates));
    const cx = site.center[0],
      cy = site.center[1],
      cos = Math.cos((cy * Math.PI) / 180);
    const xs = points.map((p) => (p[0] - cx) * cos),
      ys = points.map((p) => p[1] - cy);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const scale = Math.min(
      720 / Math.max(maxX - minX, 0.001),
      430 / Math.max(maxY - minY, 0.001),
    );
    return (p) => [
      400 + ((p[0] - cx) * cos - (maxX + minX) / 2) * scale,
      245 - (p[1] - cy - (maxY + minY) / 2) * scale,
    ];
  }, [site, features]);
  const line = (coords) => coords.map((p) => view(p).join(",")).join(" ");
  const ink = dark ? "#6ec5b6" : "#168e81";
  return (
    <svg
      className="survey-fallback"
      viewBox="0 0 800 490"
      role="img"
      aria-label={`${site.name} survey map; WebGL unavailable`}
    >
      <rect width="800" height="490" fill={dark ? "#173544" : "#e9eee9"} />
      {Array.from({ length: 17 }, (_, i) => (
        <path
          key={i}
          d={`M${i * 50} 0V490 M0 ${i * 50}H800`}
          stroke={ink}
          opacity=".09"
        />
      ))}
      {features.features
        .filter((f) => ["Polygon", "MultiPolygon"].includes(f.geometry.type))
        .map((f) => {
          const polygons =
            f.geometry.type === "Polygon"
              ? [f.geometry.coordinates]
              : f.geometry.coordinates;
          const d = polygons
            .flatMap((p) =>
              p.map(
                (r) => "M" + r.map((x) => view(x).join(" ")).join("L") + "Z",
              ),
            )
            .join(" ");
          return (
            <path
              key={f.properties.id}
              d={d}
              fillRule="evenodd"
              fill={f.properties.category === "hazard" ? "#d65b69" : "#229986"}
              fillOpacity={f.properties.category === "hazard" ? 0.16 : 0.03}
              stroke={f.properties.category === "hazard" ? "#bb7772" : ink}
              strokeDasharray="5 4"
              strokeWidth="1.3"
            >
              <title>{f.properties.name} · candidate geometry</title>
            </path>
          );
        })}
      {features.features
        .filter((f) => f.geometry.type === "LineString")
        .map((f) => (
          <polyline
            key={f.properties.id}
            points={line(f.geometry.coordinates)}
            fill="none"
            stroke={
              f.properties.category === "restricted_route" ? "#89949c" : ink
            }
            strokeWidth={selectedRoute === f.properties.id ? 5 : 2}
            strokeDasharray={
              f.properties.category === "restricted_route" ? "3 3" : undefined
            }
            tabIndex={f.properties.category === "route" ? 0 : undefined}
            role={f.properties.category === "route" ? "button" : undefined}
            aria-label={f.properties.name}
            onClick={() => onRouteSelect?.(f.properties.id)}
            onKeyDown={(e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                onRouteSelect?.(f.properties.id);
              }
            }}
          >
            <title>{f.properties.name}</title>
          </polyline>
        ))}
      {route && (
        <polyline
          points={line(route.coordinates)}
          fill="none"
          stroke="#20ad94"
          strokeWidth="5"
        />
      )}
      {features.features
        .filter(
          (f) =>
            f.geometry.type === "Point" && f.properties.category !== "terrain",
        )
        .map((f) => {
          const [x, y] = view(f.geometry.coordinates);
          return (
            <circle
              key={f.properties.id}
              cx={x}
              cy={y}
              r="5"
              fill={ink}
              stroke="white"
              strokeWidth="2"
            >
              <title>{f.properties.name} · needs field verification</title>
            </circle>
          );
        })}
      {people.map((p) => {
        const [x, y] = view([p.lng, p.lat]);
        return (
          <circle
            key={p.id}
            cx={x}
            cy={y}
            r="3"
            fill={p.role === "team" ? "#548ee9" : "#c79849"}
          >
            <title>{p.id} · simulated</title>
          </circle>
        );
      })}
      {incidents.map((p) => {
        const [x, y] = view([p.lng, p.lat]);
        return (
          <circle key={p.id} cx={x} cy={y} r="8" fill="#f4556c" stroke="white">
            <title>Demo SOS</title>
          </circle>
        );
      })}
      {position && (
        <circle
          cx={view(position)[0]}
          cy={view(position)[1]}
          r="6"
          fill="#4088cc"
          stroke="white"
          strokeWidth="2"
        />
      )}
      <text x="30" y="455" fill={dark ? "#b7d0d7" : "#47736b"} fontSize="11">
        ORIGINAL SURVEY GEOMETRY · NORTH ↑ · FIELD VERIFICATION REQUIRED
      </text>
    </svg>
  );
}
