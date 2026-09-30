import { useMemo, useState } from "react";
import { Footprints, CheckCircle2, X, Play, Download } from "lucide-react";
import { useWater } from "../store/water-context";
import { routeSupport } from "../../../shared/consensus.mjs";
import { downloadJSON } from "../services/api";
import { Badge } from "./Shared";

/** Review consented or simulated path traces before proposing shared routes. */
export default function Contributions() {
  const { site, state, dispatch, notify } = useWater();
  const [busy, setBusy] = useState(false);
  const traces = state.traces.filter((trace) => trace.site === site.id);
  // Consensus is pure, so it only needs to run again when evidence changes.
  const support = useMemo(
    () => routeSupport(site, state.traces),
    [site, state.traces],
  );
  /** Add three visibly labelled synthetic traces for demonstration purposes. */
  async function sample() {
    setBusy(true);
    try {
      const route = site.features.features.find(
        (f) =>
          f.properties.category === "route" &&
          f.geometry.type === "LineString" &&
          f.geometry.coordinates.length >= 3,
      );
      if (!route) throw new Error("No suitable mapped route is available.");
      for (let i = 0; i < 3; i++) {
        const points = route.geometry.coordinates.map((p) => [
          p[0] + (i - 1) * 0.000015,
          p[1] + (i - 1) * 0.000012,
        ]);
        await dispatch(
          "trace",
          { site: site.id, points, consent: true, simulation: true },
          `sample-trace-${site.id}-${i}`,
        );
      }
      notify(
        "Three synthetic contributions loaded. Review each before calculating shared route support.",
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  /** Mark one contribution as accepted or rejected after operator review. */
  async function review(id, status) {
    setBusy(true);
    try {
      await dispatch("review_trace", { site: site.id, id, status });
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel contribution-panel">
      <div className="panel-head">
        <h2>
          <Footprints size={19} /> Community path review
        </h2>
        <button className="button secondary" disabled={busy} onClick={sample}>
          <Play size={14} />
          Load demo traces
        </button>
      </div>
      <p className="compact muted">
        Review contributions, then compare agreement with your mapped paths.
        Three distinct reviewed traces are needed for a usage proposal. This
        never certifies access or safety.
      </p>
      <div className="trace-review-list">
        {traces.length ? (
          traces.map((t) => (
            <div className="trace-review" key={t.id}>
              <div>
                <strong>Trace {t.id.slice(-8)}</strong>
                <small>
                  {t.points.length} points ·{" "}
                  {t.source === "simulation"
                    ? "synthetic drill"
                    : "consented contribution"}
                </small>
              </div>
              <Badge value={t.status === "reviewed" ? "teal" : "unknown"}>
                {t.status.replaceAll("_", " ")}
              </Badge>
              {t.status === "pending_review" && (
                <div className="row">
                  <button
                    className="icon-button"
                    aria-label={`Accept trace ${t.id.slice(-8)} for comparison`}
                    disabled={busy}
                    onClick={() => review(t.id, "reviewed")}
                  >
                    <CheckCircle2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Reject trace ${t.id.slice(-8)}`}
                    disabled={busy}
                    onClick={() => review(t.id, "rejected")}
                  >
                    <X size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Inspect trace coordinates"
                    onClick={() =>
                      downloadJSON(`trace-${t.id}.geojson`, {
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: t.points },
                        properties: { ...t, points: undefined },
                      })
                    }
                  >
                    <Download size={16} />
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Footprints size={27} />
            <p>
              Contribute a trip in Explore, or load the synthetic review drill.
            </p>
          </div>
        )}
      </div>
      {support
        .filter((r) => r.count > 0)
        .map((r) => (
          <div className="route-support" key={r.route_id}>
            <div>
              <strong>{r.name}</strong>
              <p>
                {r.count} distinct reviewed traces · at least 70% of sampled
                points within 20 m
              </p>
            </div>
            <button
              className="button secondary"
              disabled={!r.eligible}
              onClick={() => {
                downloadJSON(`${site.id}-route-proposal.geojson`, {
                  type: "Feature",
                  geometry: r.geometry,
                  properties: {
                    ...r,
                    geometry: undefined,
                    site: site.id,
                    source: "demo_workspace",
                    requires_field_verification: true,
                  },
                });
                notify(
                  "Usage proposal exported. Field verification is still required.",
                );
              }}
            >
              <Download size={15} />
              {r.eligible ? "Export proposal" : "Needs 3 traces"}
            </button>
          </div>
        ))}
      <p className="source-note">
        Duplicate geometries count once. Agreement only supports the mapped
        section that the traces actually cover. No new shortcuts are inferred.
      </p>
    </section>
  );
}
