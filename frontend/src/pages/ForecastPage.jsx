import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  CloudRain,
  Wind,
  Waves,
  Gauge,
  ArrowUpRight,
  Info,
  RefreshCw,
  Thermometer,
  ShieldAlert,
  Clock,
  ExternalLink,
  Droplets,
} from "lucide-react";
import { useWater } from "../store/water-context";
import {
  SiteSwitcher,
  PageHeading,
  Footer,
  Chart,
  Modal,
  Badge,
  ScenarioControl,
} from "../components/Shared";
import { api, downloadJSON } from "../services/api";
import ZoneOutlook from "../components/ZoneOutlook";
import { useAuth } from "../store/auth-context";
import { riskFor, RULES } from "../../../shared/engine.mjs";

/** Display timestamps consistently in the pilot sites' local time zone. */
const formatTime = (timestamp) =>
  timestamp
    ? new Date(timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unavailable";
const metricDefinitions = {
  wave_height: { label: "Significant wave height", unit: "m", icon: Waves },
  water_level: { label: "Water level", unit: "m", icon: Droplets },
  flow_speed: { label: "Surface current", unit: "m/s", icon: Gauge },
  rainfall: { label: "Hourly rainfall", unit: "mm", icon: CloudRain },
  wind: { label: "Wind speed", unit: "km/h", icon: Wind },
  temperature: { label: "Air temperature", unit: "°C", icon: Thermometer },
};

/** Compare prepared demonstration data with optional live model forecasts. */
export default function ForecastPage() {
  const { admin, user } = useAuth();
  const { site, siteId, frame, scenario, notify } = useWater();
  const [source, setSource] = useState("demo");
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [horizon, setHorizon] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const requestRef = useRef(null);

  // Cancel network work if the user leaves before the model responds.
  useEffect(() => () => requestRef.current?.abort(), []);

  /** Request an on-demand numerical forecast for the selected pilot site. */
  async function loadModel() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await api(`/weather/${siteId}`, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!controller.signal.aborted) {
        setModel(response);
        setSource("model");
      }
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  // Convert Open-Meteo's parallel hourly arrays into ordinary row objects.
  const modelRows = useMemo(() => {
    if (!model?.weather.hourly) return [];

    const weather = model.weather.hourly;
    const marine = model.marine?.hourly;
    const currentSpeedUnit = model.marine?.hourly_units?.ocean_current_velocity;

    const convertCurrentToMetersPerSecond = (value) => {
      if (value == null) return null;
      if (currentSpeedUnit === "km/h") return value / 3.6;
      if (currentSpeedUnit === "m/s") return value;
      return null;
    };

    return weather.time.map((timestamp, index) => {
      const marineIndex = marine?.time.indexOf(timestamp) ?? -1;
      const hasMarineSample = marineIndex >= 0;
      return {
        timestamp: timestamp + "+05:30",
        temperature: weather.temperature_2m[index],
        rainfall: weather.precipitation[index],
        wind: weather.wind_speed_10m[index],
        wind_direction: weather.wind_direction_10m?.[index],
        rain_probability: weather.precipitation_probability?.[index],
        wave_height: hasMarineSample ? marine.wave_height[marineIndex] : null,
        flow_speed: hasMarineSample
          ? convertCurrentToMetersPerSecond(
              marine.ocean_current_velocity?.[marineIndex],
            )
          : null,
        water_level: null,
        sea_level_msl: hasMarineSample
          ? marine.sea_level_height_msl?.[marineIndex]
          : null,
      };
    });
  }, [model]);
  // From this point onward demo and model data share one display shape.
  const isModel = source === "model" && model;
  const rows = isModel ? modelRows : site.timeline;
  const baseline =
    Math.max(
      0,
      rows.findIndex((r) =>
        isModel
          ? Date.parse(r.timestamp) >= Date.parse(model.retrieved_at) - 3600000
          : r.timestamp.startsWith("2026-09-07T12"),
      ),
    ) + (isModel ? 0 : Math.floor(frame / 3));
  const index = Math.min(rows.length - 1, baseline + horizon);
  const sample = rows[index] || {};
  const currentRisk = isModel ? null : riskFor(site, sample, scenario);
  const metrics = isModel
    ? sample
    : {
        ...currentRisk.metrics,
        ...Object.fromEntries(
          Object.entries(sample.simulation_metrics || {}).filter(
            ([key]) => currentRisk.metrics[key] == null,
          ),
        ),
      };
  // Only metrics relevant to this type of water landscape are shown.
  const keys =
    site.type === "beach"
      ? ["wave_height", "flow_speed", "wind", "rainfall"]
      : ["water_level", "rainfall", "wind", "temperature"];
  const history = rows.slice(
    Math.max(0, index - 12),
    Math.min(rows.length, index + 13),
  );
  const title = isModel
    ? "A clearer view of the conditions."
    : currentRisk.status === "avoid"
      ? "Conditions call for extra caution."
      : currentRisk.status === "caution"
        ? "Watch the water. Plan ahead."
        : "Know what’s happening at the water.";
  // Tide rows remain reference data; they are never presented as live sensors.
  const tideDay =
    site.tides?.days.find(
      (d) => d.date === (sample.timestamp || "").slice(0, 10),
    ) || site.tides?.days[0];
  return (
    <div className="page forecast-page">
      <PageHeading
        eyebrow="FORECAST & EARLY AWARENESS"
        title="Read the conditions. Plan your visit."
        description="Site-specific signals, their sources, and what’s changing."
      >
        <button
          className="button secondary"
          onClick={loadModel}
          aria-label="Refresh weather model"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spinning" : ""} />
          <span>{loading ? "Fetching model…" : "Refresh weather model"}</span>
        </button>
      </PageHeading>
      <SiteSwitcher />
      <div className="forecast-toolbar">
        <div className="segmented">
          <button
            className={source === "demo" ? "active" : ""}
            onClick={() => setSource("demo")}
          >
            Dataset replay
          </button>
          <button
            className={source === "model" ? "active" : ""}
            onClick={() => (model ? setSource("model") : loadModel())}
            disabled={loading}
          >
            Current weather model
          </button>
        </div>
        <div className="horizon-tabs">
          {[
            [0, "Now"],
            [3, "Next 3 hours"],
            [24, "Next 24 hours"],
          ].map(([h, l]) => (
            <button
              className={horizon === h ? "active" : ""}
              aria-pressed={horizon === h}
              key={h}
              onClick={() => setHorizon(h)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="inline-notice">
          <Info size={18} />
          {error}
        </div>
      )}
      <section
        className={`forecast-hero ${isModel ? "model" : currentRisk.status}`}
      >
        <div className="hero-copy">
          <div className="row">
            <Badge value={isModel ? "unknown" : currentRisk.status}>
              {isModel ? "NUMERICAL WEATHER MODEL" : undefined}
            </Badge>
            <span className="hero-metadata">
              {isModel ? "Retrieved" : "Source replay"}{" "}
              {formatTime(isModel ? model.retrieved_at : sample.timestamp)} IST
            </span>
          </div>
          <h2>{title}</h2>
          <p>
            {isModel
              ? "Forecast model output provides environmental context. Local water safety is unassessed."
              : currentRisk.status === "avoid"
                ? "One or more demonstration thresholds are exceeded. Open emergency mode to rehearse the response."
                : "Explore the contributing signals below. Low modeled risk does not certify a location as safe."}
          </p>
          <Link to={isModel ? "/data" : "/emergency"} className="text-link">
            {isModel ? "Understand data coverage" : "Open response tools"}
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="hero-orbit">
          <Waves size={52} strokeWidth={1.2} />
          <i />
          <i />
        </div>
      </section>
      <div className="metric-grid">
        {keys.map((key) => {
          const d = metricDefinitions[key],
            Icon = d.icon,
            value = metrics[key],
            rule = RULES[site.type].find((r) => r.key === key),
            level =
              value == null
                ? "unknown"
                : rule
                  ? value >= rule.avoid
                    ? "avoid"
                    : value >= rule.caution
                      ? "caution"
                      : "low"
                  : "low";
          return (
            <button
              key={key}
              className={`metric-card ${level}`}
              onClick={() => setExpanded(key)}
            >
              <div className="metric-heading">
                <span>{d.label}</span>
                <Icon size={19} />
              </div>
              <div className="metric-value">
                {value == null
                  ? "—"
                  : Number(value).toFixed(
                      key === "temperature" || key === "wind" ? 1 : 2,
                    )}
                <small>{d.unit}</small>
              </div>
              <div className="metric-status">
                {value == null
                  ? "No local reading available"
                  : isModel
                    ? "Model estimate"
                    : key === "wind" && site.type === "beach"
                      ? "Transcribed · converted from knots"
                      : "Synthetic demonstration"}
              </div>
              <Chart
                values={history.map(
                  (r) =>
                    r[key] ?? (!isModel ? r.simulation_metrics?.[key] : null),
                )}
                color={
                  level === "avoid"
                    ? "#b94650"
                    : level === "caution"
                      ? "#b58a3e"
                      : "#228d84"
                }
                height={90}
                bars={key === "rainfall"}
                threshold={!isModel ? rule?.avoid : null}
                label={`${d.label} history in ${d.unit}`}
              />
              <div className="metric-footer">
                <span>
                  {rule && !isModel
                    ? `Demo threshold ${rule.avoid} ${rule.unit}`
                    : "View history & source"}
                </span>
                <ArrowUpRight size={14} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="forecast-bottom">
        <section className="panel">
          <div className="panel-head">
            <h2>{isModel ? "Forecast context" : "Why this risk level?"}</h2>
            <Info size={17} className="muted" />
          </div>
          {isModel ? (
            <div className="stack">
              <p className="compact muted">
                Current weather is fetched from Open-Meteo, with the original
                timestamps and units retained. No missing river level or flow
                value is substituted.
              </p>
              <p className="compact muted">
                Nearshore rip currents require local observations. Ocean model
                currents and sea-level estimates do not establish beach safety.
              </p>
              <a
                className="text-link"
                href="https://open-meteo.com/en/docs"
                target="_blank"
                rel="noreferrer"
              >
                Open-Meteo documentation
                <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            <>
              <div className="risk-score-card">
                <div className={`risk-score-ring ${currentRisk.status}`}>
                  <strong>{currentRisk.score}</strong>
                  <span>/ 100</span>
                </div>
                <div>
                  <strong>Transparent modeled risk score</strong>
                  <p>{currentRisk.method}.</p>
                  <small>{currentRisk.confidence}% input coverage</small>
                </div>
              </div>
              <div className="driver-list">
                {currentRisk.drivers.map((d) => (
                  <div className="driver-wrap" key={d.key}>
                    <div className="driver">
                      <span className={`driver-dot ${d.level}`} />
                      <span>{d.label}</span>
                      <strong>
                        {d.value == null
                          ? "Unavailable"
                          : `${d.value.toFixed(2)} ${d.unit}`}
                      </strong>
                      <Badge value={d.level}>
                        {d.level === "unknown"
                          ? "MISSING"
                          : d.level.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="driver-contribution">
                      <span
                        style={{ width: `${d.contribution ?? 0}%` }}
                        className={d.level}
                      />
                    </div>
                    <small>
                      {d.contribution == null
                        ? "Not included in score"
                        : `${d.contribution}% of avoid threshold`}
                    </small>
                  </div>
                ))}
              </div>
              <p className="source-note">
                Rules are transparent demo thresholds, not a trained or
                calibrated prediction model. Missing inputs reduce coverage.
              </p>
              {admin && user.demo && <ScenarioControl />}
            </>
          )}
        </section>
        <section className="panel">
          {site.type === "beach" ? (
            <>
              <div className="panel-head">
                <h2>{isModel ? "Sea level context" : "Tide reference"}</h2>
                <Waves size={20} className="muted" />
              </div>
              {isModel ? (
                <>
                  <div className="metric-value">
                    {sample.sea_level_msl == null
                      ? "—"
                      : sample.sea_level_msl.toFixed(2)}
                    <small>m MSL</small>
                  </div>
                  <p className="source-note">
                    Model sea level relative to global mean sea level. This is a
                    different datum from the transcribed tide chart; coastal
                    accuracy is limited.
                  </p>
                </>
              ) : (
                <>
                  <p className="compact muted">
                    {tideDay?.date} · transcribed chart, unverified
                  </p>
                  <div className="tide-list">
                    {[
                      ...(tideDay?.high_tides || []).map((x) => ({
                        ...x,
                        type: "High tide",
                      })),
                      ...(tideDay?.low_tides || []).map((x) => ({
                        ...x,
                        type: "Low tide",
                      })),
                    ]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((t, i) => (
                        <div key={i}>
                          <span>
                            <Clock size={14} />
                            {t.time} IST
                          </span>
                          <strong>{t.height_m.toFixed(2)} m</strong>
                          <small>{t.type}</small>
                        </div>
                      ))}
                  </div>
                  <a
                    href="https://incois.gov.in/site/forecast.jsp"
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Check official ocean advisories
                    <ExternalLink size={12} />
                  </a>
                </>
              )}
            </>
          ) : (
            <>
              <div className="panel-head">
                <h2>Upstream matters</h2>
                <CloudRain size={21} className="muted" />
              </div>
              <p className="compact muted">
                Rainfall higher in the catchment can change conditions
                downstream. A regional reservoir release is not a local
                river-level observation.
              </p>
              <div className="data-gap">
                <ShieldAlert size={19} />
                <div>
                  <strong>
                    {site.type === "river"
                      ? "Local river gauge unavailable"
                      : "Gauge readings are synthetic"}
                  </strong>
                  <p>
                    Station location, datum and terrain must be validated before
                    operational forecasting.
                  </p>
                </div>
              </div>
              <Link to="/data" className="text-link">
                Review the source register
                <ArrowUpRight size={13} />
              </Link>
            </>
          )}
        </section>
      </div>
      <div className="forecast-export">
        <span>
          <Clock size={14} />
          {isModel
            ? "Model timestamps shown in IST."
            : "“Now” is the selected dataset replay time, not a live sensor reading."}
        </span>
        <button
          className="text-link"
          onClick={() => {
            downloadJSON(`${siteId}-${source}-forecast.json`, {
              site: siteId,
              source,
              timestamp: sample.timestamp,
              values: metrics,
              method: currentRisk?.method,
              model_source: isModel ? model.source_url : null,
            });
            notify("Forecast snapshot exported with source and timestamp.");
          }}
        >
          Export snapshot
          <ArrowUpRight size={13} />
        </button>
      </div>
      {!isModel && (
        <p className="inline-notice">
          Dataset replay includes generated estimates for missing local gauge or
          temperature fields. These are illustrative values, not measured
          observations.
        </p>
      )}
      <ZoneOutlook
        sample={sample}
        previous={rows[Math.max(0, index - 3)]}
        scenario={isModel ? "normal" : scenario}
      />
      <Footer />
      {expanded && (
        <Modal
          title={metricDefinitions[expanded].label}
          onClose={() => setExpanded(null)}
        >
          <p>
            {isModel ? "Numerical weather model" : "Supplied dataset replay"} ·{" "}
            {metricDefinitions[expanded].unit}. Gaps remain gaps in the chart.
          </p>
          <Chart
            values={rows
              .slice(Math.max(0, index - 24), index + 25)
              .map((r) => r[expanded])}
            height={170}
            label={`${metricDefinitions[expanded].label} detailed history`}
          />
          <div className="detail-table">
            {history.map((r, i) => (
              <div key={i}>
                <span>{formatTime(r.timestamp)} IST</span>
                <strong>
                  {r[expanded] == null
                    ? "Missing"
                    : `${Number(r[expanded]).toFixed(2)} ${metricDefinitions[expanded].unit}`}
                </strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
