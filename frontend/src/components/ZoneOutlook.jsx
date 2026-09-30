import { useMemo } from "react";
import { useWater } from "../store/water-context";
import { zoneForecast } from "../../../shared/navigation.mjs";
import { inGeometry } from "../../../shared/engine.mjs";

/** Explain how modeled conditions vary across the selected site's mapped zones. */
export default function ZoneOutlook({
  sample,
  previous,
  scenario: scenarioOverride,
}) {
  const {
    site,
    frame,
    scenario,
    position,
    people,
    sample: contextSample,
  } = useWater();
  const index = Math.min(site.timeline.length - 1, Math.floor(frame / 3));
  const rows = useMemo(
    () =>
      zoneForecast(
        site,
        sample || contextSample || site.timeline[index],
        previous || site.timeline[Math.max(0, index - 1)],
        scenarioOverride || scenario,
      ),
    [site, sample, contextSample, previous, index, scenario, scenarioOverride],
  );
  const local = rows.filter((r) => inGeometry(position, r.geometry));
  const highRiskZones = rows.filter((row) => row.level === "high");
  // Count only displayed simulated/consented positions; this is exposure, not occupancy.
  const exposedPeople = people.filter((person) =>
    highRiskZones.some((zone) =>
      inGeometry([person.lng, person.lat], zone.geometry),
    ),
  );
  return (
    <section className="zone-outlook">
      <div className="panel-head">
        <div>
          <span className="eyebrow">AREA BY AREA</span>
          <h2>Know where conditions change.</h2>
        </div>
        <span className="pill">{rows.length} mapped areas & points</span>
      </div>
      <div className="location-alert" role="status">
        {local.length
          ? `Your planning position: ${local.map((z) => `${z.name} — ${z.status}`).join(" · ")}`
          : "Your position is outside the mapped hazard polygons. Conditions here are not verified."}
      </div>
      <div className="zone-impact" aria-label="Modeled zone impact summary">
        <div>
          <strong>{highRiskZones.length}</strong>
          <span>high-risk mapped areas</span>
        </div>
        <div>
          <strong>{exposedPeople.length}</strong>
          <span>displayed people inside them</span>
        </div>
        <div>
          <strong>{scenarioOverride || scenario}</strong>
          <span>active scenario</span>
        </div>
      </div>
      <div className="zone-grid">
        {rows.map((z) => (
          <article className={`zone-card ${z.level}`} key={z.id}>
            <span className="zone-dot" />
            <div>
              <h3>{z.name}</h3>
              <strong>
                {z.rising ? "↗ " : ""}
                {z.status}
              </strong>
              <p>
                {z.drivers.join(" · ") || "Local exposure and mapped geography"}
              </p>
              <small>
                {z.coverage} · {z.score}/100 model score
              </small>
            </div>
          </article>
        ))}
      </div>
      <p className="compact">
        Illustrative spatial model using mapped zones and site-specific
        thresholds. Green means lower modeled risk, not a safety clearance.
      </p>
    </section>
  );
}
