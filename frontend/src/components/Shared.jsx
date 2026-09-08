import { useEffect, useRef, useId } from "react";
import {
  Waves,
  Mountain,
  Waypoints,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  X,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import {useAuth} from "../store/auth-context";
import { useWater } from "../store/water-context";
export function SiteSwitcher() {
  const { manifest, siteId, setSiteId } = useWater();
  const icons = { beach: Waves, river: Waypoints, waterfall: Mountain };
  return (
    <div className="site-switcher" aria-label="Choose a pilot site">
      {manifest.sites.map((s) => {
        const Icon = icons[s.type];
        return (
          <button
            key={s.id}
            className={`site-option ${siteId === s.id ? "selected" : ""}`}
            onClick={() => setSiteId(s.id)}
            aria-pressed={siteId === s.id}
          >
            <span className="site-icon">
              <Icon size={23} />
            </span>
            <span>
              <strong>{s.name}</strong>
              <small>{s.region}</small>
            </span>
            {siteId === s.id && (
              <CheckCircle2 size={17} className="site-check" />
            )}
          </button>
        );
      })}
    </div>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function ReplayBar() {
  const { frame, setFrame, playing, setPlaying, people } = useWater();
  return (
    <div className="replay-bar">
      <button
        className="icon-button"
        onClick={() => {
          if (frame === 60) setFrame(0);
          setPlaying(!playing);
        }}
        aria-label={playing ? "Pause GPS replay" : "Play GPS replay"}
      >
        {playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <span className="replay-label">GPS replay</span>
      <input
        aria-label="Replay frame"
        type="range"
        min="0"
        max="60"
        value={frame}
        onChange={(e) => {
          setPlaying(false);
          setFrame(Number(e.target.value));
        }}
      />
      <span className="replay-time">{String(frame).padStart(2, "0")} / 60</span>
      <button
        className="icon-button"
        aria-label="Reset replay"
        onClick={() => {
          setFrame(0);
          setPlaying(false);
        }}
      >
        <RotateCcw size={15} />
      </button>
      <span className="replay-tag">
        {people.filter((p) => p.role === "visitor").length} simulated visitors
      </span>
    </div>
  );
}
export function Footer() {
  const {admin}=useAuth();
  return (
    <footer className="page-footer">
      <Link to={admin?"/data":"/forecast"}>
        <ShieldCheck size={12} /> Source-mapped geography · clearly labelled
        demo data <ArrowUpRight size={12} />
      </Link>
      <span>Designed for safer journeys, together.</span>
    </footer>
  );
}
export function Badge({ value, children }) {
  return (
    <span className={`pill ${value || ""}`}>
      {children ||
        {
          low: "LOW DEMO RISK",
          caution: "CAUTION",
          avoid: "AVOID",
          unknown: "INCOMPLETE DATA",
        }[value] ||
        value?.replaceAll("_", " ")}
    </span>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null),
    closeRef = useRef(onClose),
    id = useId();
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const cancel = (e) => {
      e.preventDefault();
      closeRef.current();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ScenarioControl() {
  const { siteId, scenario, dispatch, notify } = useWater();
  return (
    <div className="segmented" aria-label="Demonstration scenario">
      {[
        ["normal", "Baseline"],
        ["watch", "Rising risk"],
        ["danger", "Hazard spike"],
      ].map(([value, label]) => (
        <button
          aria-pressed={scenario === value}
          className={scenario === value ? "active" : ""}
          key={value}
          onClick={() =>
            dispatch("scenario", { site: siteId, value }).catch((e) =>
              notify(e.message),
            )
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export function Chart({
  values,
  color = "#138e89",
  height = 110,
  bars = false,
  threshold = null,
  label = "Metric history",
}) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length)
    return <div className="empty-chart">No readings available</div>;
  const max = Math.max(...valid, threshold || 0, 1) * 1.12,
    min = Math.min(0, ...valid),
    x = (i) => 10 + (i * 300) / Math.max(values.length - 1, 1),
    y = (v) => height - 12 - ((v - min) / (max - min)) * (height - 22);
  const segments = [];
  let current = [];
  values.forEach((v, i) => {
    if (Number.isFinite(v)) current.push(`${x(i)},${y(v)}`);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 320 ${height}`}
      className="chart"
      style={{ height }}
    >
      {[0.25, 0.5, 0.75].map((v) => (
        <line
          key={v}
          x1="8"
          x2="312"
          y1={height * v}
          y2={height * v}
          stroke="currentColor"
          opacity=".07"
        />
      ))}
      {threshold != null && (
        <line
          x1="8"
          x2="312"
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="#b57d39"
          strokeDasharray="4 4"
        />
      )}
      {bars
        ? values.map(
            (v, i) =>
              Number.isFinite(v) && (
                <rect
                  key={i}
                  x={x(i) - 3}
                  y={y(v)}
                  width={Math.max(2, 240 / values.length)}
                  height={height - 12 - y(v)}
                  rx="2"
                  fill={color}
                  opacity=".75"
                />
              ),
          )
        : segments.map((s, i) => (
            <g key={i}>
              <polygon
                points={`${s[0].split(",")[0]},${height - 12} ${s.join(" ")} ${s.at(-1).split(",")[0]},${height - 12}`}
                fill={color}
                opacity=".08"
              />
              <polyline
                points={s.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
    </svg>
  );
}
