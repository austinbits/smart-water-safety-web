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
import { useAuth } from "../store/auth-context";
import { useWater } from "../store/water-context";

/** Let the user switch between the three prepared pilot locations. */
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

/** Standard title area shared by every application page. */
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

/** Control the one-minute anonymized movement replay shown to operators. */
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

/** Display the common safety and provenance note at the bottom of pages. */
export function Footer() {
  const { admin } = useAuth();
  return (
    <footer className="page-footer">
      <Link to={admin ? "/data" : "/forecast"}>
        <ShieldCheck size={12} /> Source-mapped geography · clearly labelled
        demo data <ArrowUpRight size={12} />
      </Link>
      <span>Designed for safer journeys, together.</span>
    </footer>
  );
}

/** Render a small semantic status label using the requested color value. */
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

/** Accessible native dialog that opens and closes with its React state. */
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

/** Allow demo operators to switch between baseline and danger simulations. */
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

/** Draw a lightweight SVG line chart without adding a chart dependency. */
export function Chart({
  values,
  color = "#138e89",
  height = 110,
  bars = false,
  threshold = null,
  label = "Metric history",
}) {
  const validValues = values.filter(Number.isFinite);
  if (!validValues.length) {
    return <div className="empty-chart">No readings available</div>;
  }

  // Convert data values into positions inside the fixed 320-pixel view box.
  const maximum = Math.max(...validValues, threshold || 0, 1) * 1.12;
  const minimum = Math.min(0, ...validValues);
  const xPosition = (index) =>
    10 + (index * 300) / Math.max(values.length - 1, 1);
  const yPosition = (value) =>
    height - 12 - ((value - minimum) / (maximum - minimum)) * (height - 22);

  // Missing readings split a line into separate segments instead of inventing data.
  const segments = [];
  let currentSegment = [];
  values.forEach((value, index) => {
    if (Number.isFinite(value)) {
      currentSegment.push(`${xPosition(index)},${yPosition(value)}`);
    } else if (currentSegment.length) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length) segments.push(currentSegment);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 320 ${height}`}
      className="chart"
      style={{ height }}
    >
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1="8"
          x2="312"
          y1={height * fraction}
          y2={height * fraction}
          stroke="currentColor"
          opacity=".07"
        />
      ))}
      {threshold != null && (
        <line
          x1="8"
          x2="312"
          y1={yPosition(threshold)}
          y2={yPosition(threshold)}
          stroke="#b57d39"
          strokeDasharray="4 4"
        />
      )}
      {bars
        ? values.map(
            (value, index) =>
              Number.isFinite(value) && (
                <rect
                  key={index}
                  x={xPosition(index) - 3}
                  y={yPosition(value)}
                  width={Math.max(2, 240 / values.length)}
                  height={height - 12 - yPosition(value)}
                  rx="2"
                  fill={color}
                  opacity=".75"
                />
              ),
          )
        : segments.map((segment, index) => (
            <g key={index}>
              <polygon
                points={`${segment[0].split(",")[0]},${height - 12} ${segment.join(" ")} ${segment.at(-1).split(",")[0]},${height - 12}`}
                fill={color}
                opacity=".08"
              />
              <polyline
                points={segment.join(" ")}
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
