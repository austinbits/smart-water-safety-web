import { useEffect, useState } from "react";
import {
  Database,
  FileCheck2,
  MapPinned,
  Download,
  Search,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  Info,
} from "lucide-react";
import { useWater } from "../store/water-context";
import {
  PageHeading,
  SiteSwitcher,
  Footer,
  Modal,
  Badge,
} from "../components/Shared";
import { api, downloadJSON } from "../services/api";

// External references are shown separately from project datasets so visitors
// can distinguish authoritative sources, model providers, and mapped surveys.
const sources = [
  {
    name: "Regional terrain elevation",
    publisher: "Mapzen / SRTM / AWS Open Data",
    url: "https://registry.opendata.aws/terrain-tiles/",
    label: "REAL REGIONAL DEM",
    text: "Three 33×33 sampled grids plus streamed 3D terrain. Regional resolution; not a trail survey or bathymetry. Rendering exaggeration 1.5×.",
  },
  {
    name: "India emergency response",
    publisher: "Government of India",
    url: "https://112.gov.in/",
    label: "OFFICIAL · CHECKED",
    text: "112 is the national emergency response number. This prototype opens the phone dialler only when requested; it has no official dispatch connection.",
  },
  {
    name: "Ocean state & coastal advisories",
    publisher: "INCOIS · Ministry of Earth Sciences",
    url: "https://incois.gov.in/site/services/osf.jsp",
    label: "OFFICIAL · REFERENCE",
    text: "Authoritative ocean advisory service. The app does not claim access to a local rip-current sensor or an INCOIS operational feed.",
  },
  {
    name: "Weather & marine forecasts",
    publisher: "Open-Meteo",
    url: "https://open-meteo.com/en/docs/marine-weather-api",
    label: "MODEL · ON DEMAND",
    text: "Numerical forecasts, with returned units and timestamps. Ocean currents and tides have limited coastal accuracy; they are not suitable for coastal navigation.",
  },
  {
    name: "Goa river water levels",
    publisher: "NWIC · Ministry of Jal Shakti",
    url: "https://www.nwdp.nwic.gov.in/dataset/river-water-level-telemetry-hourly-goa-department",
    label: "OFFICIAL · STATION CHECK PENDING",
    text: "Official hourly telemetry dataset exists. A station has not been matched to the Dudhsagar study reach, so no local observed stage is asserted.",
  },
  {
    name: "Dudhsagar incident records",
    publisher: "Goa Legislative Assembly",
    url: "https://static.goavidhansabha.gov.in/goalpub/docs/question_docs/file_d7736f87-cb0f-45ce-87e5-2dc1be1f1190.pdf",
    label: "OFFICIAL DOCUMENT · CHECKED",
    text: "The two supplied incident records dated 22 November 2021 and 5 September 2022 match page 4 of the government annexure. Their precise coordinates are not established.",
  },
  {
    name: "Base maps & path geometry",
    publisher: "OpenStreetMap + supplied KML survey",
    url: "https://www.openstreetmap.org/copyright",
    label: "MAPPED · FIELD CHECK PENDING",
    text: "Street tiles are attributed to OpenStreetMap. Project paths and landmarks come from the original KMLs. Mapped geometry is not evidence of safe access.",
  },
];
const humanize = (value) => value.replaceAll("_", " ");

/** Inspect prepared datasets, their provenance, and their sample records. */
export default function DataPage() {
  const { manifest, siteId, site, notify } = useWater();
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [catalog, setCatalog] = useState({});
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [recordError, setRecordError] = useState("");

  // Catalog metadata requires administrator access, so it is loaded through the API.
  useEffect(() => {
    api("/data/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, []);

  // Search and issue counts are derived locally from the small catalog.
  const files = manifest.files.filter((file) => file.site === siteId);
  const filtered = files.filter((file) =>
    `${file.file} ${file.provenance}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const issues = files.filter((file) => file.issues.length);
  const total = files.reduce(
    (recordCount, file) => recordCount + file.records,
    0,
  );

  /** Open one dataset and clear state left by the previous selection. */
  function inspect(file) {
    setSelected(file);
    setRecords(null);
    setOffset(0);
    setRecordError("");
  }

  /** Load one bounded record page for the currently selected dataset. */
  async function loadRecords(nextOffset = 0) {
    setLoading(true);
    setRecordError("");
    try {
      const response = await api(
        `/datasets/${encodeURIComponent(selected.file)}?offset=${nextOffset}&limit=10`,
      );
      setRecords(response);
      setOffset(nextOffset);
    } catch (error) {
      setRecordError(error.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="page data-page">
      <PageHeading
        eyebrow="EVIDENCE & TRANSPARENCY"
        title="Every layer has a source."
        description="Original inputs, documented corrections and honest data coverage."
      >
        <button
          className="button secondary"
          aria-label="Export dataset register"
          onClick={() =>
            downloadJSON(`${siteId}-data-register.json`, {
              site: siteId,
              files,
            })
          }
        >
          <Download size={17} />
          <span>Export register</span>
        </button>
      </PageHeading>
      <SiteSwitcher />
      <div className="data-summary">
        <div>
          <Database size={25} />
          <div>
            <strong>{files.length}</strong>
            <span>Source datasets</span>
          </div>
        </div>
        <div>
          <FileCheck2 size={25} />
          <div>
            <strong>{total.toLocaleString()}</strong>
            <span>Supplied records</span>
          </div>
        </div>
        <div>
          <MapPinned size={25} />
          <div>
            <strong>{site.all_kml_features}</strong>
            <span>Original KML features</span>
          </div>
        </div>
      </div>
      <div className="source-tabs">
        {[
          ["catalog", "Dataset register"],
          ["corrections", `Corrections & gaps (${issues.length})`],
          ["sources", "Sources & evidence"],
        ].map(([t, l]) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "catalog" ? (
        <>
          <div className="dataset-tools">
            <input
              className="dataset-search"
              type="search"
              aria-label="Search datasets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets or provenance…"
            />
            <a
              className="button secondary"
              href={site.kml_url}
              download={site.kml}
            >
              <Download size={16} />
              Original KML
            </a>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATASET</th>
                  <th>RECORDS</th>
                  <th>PROVENANCE</th>
                  <th>INSPECT</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.file}>
                    <td>
                      <div className="dataset-name">{f.file}</div>
                      <small>
                        {(f.bytes / 1024).toFixed(1)} KB{" "}
                        {f.issues.length
                          ? `· ${f.issues.length} data notes`
                          : ""}
                      </small>
                    </td>
                    <td>{f.records.toLocaleString()}</td>
                    <td>
                      <Badge
                        value={
                          f.provenance === "synthetic"
                            ? "unknown"
                            : f.provenance === "candidate"
                              ? "caution"
                              : "teal"
                        }
                      >
                        {humanize(f.provenance)}
                      </Badge>
                    </td>
                    <td>
                      <button className="text-link" onClick={() => inspect(f)}>
                        Inspect
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty-state">
                <Search size={25} />
                No datasets match your search.
              </div>
            )}
          </div>
        </>
      ) : tab === "corrections" ? (
        <div className="issue-list">
          {issues.map((f) => (
            <article className="issue-card" key={f.file}>
              <h3>{f.file}</h3>
              {f.issues.map((i) => (
                <p key={i}>{i}</p>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="source-cards">
            {sources.map((s) => (
              <article className="panel source-card" key={s.name}>
                <Badge value="teal">{s.label}</Badge>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  {s.publisher}
                  <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-head">
              <h2>{site.name}: incident references</h2>
              <span className="pill">
                {site.history.length} SUPPLIED RECORDS
              </span>
            </div>
            <div className="issue-list">
              {site.history.map((h, i) => (
                <article key={i}>
                  <div className="row spread">
                    <h3>
                      {h.date} ·{" "}
                      {h.event_type || h.incident_type || "Reported incident"}
                    </h3>
                    <Badge
                      value={
                        h.verification === "official_document_checked"
                          ? "teal"
                          : "unknown"
                      }
                    >
                      {h.verification === "official_document_checked"
                        ? "SOURCE CHECKED"
                        : "UNVERIFIED"}
                    </Badge>
                  </div>
                  <p className="source-note">
                    {h.description || h.rescue_information || h.cause} Exact
                    incident coordinates are not verified.
                  </p>
                  {h.source_url && /^https?:\/\//.test(h.source_url) && (
                    <a
                      className="text-link"
                      href={h.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {h.source || "Supplied reference"}
                      <ExternalLink size={12} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <div className="data-guidance">
        <ShieldCheck size={22} />
        <div>
          <strong>Originals preserved. Changes traceable.</strong>
          <p>
            All 64 inputs are archived in the project. KML downloads retain the
            original bytes. Synthetic, transcribed and candidate data remain
            explicitly labelled; unverified safe zones and paths are never
            promoted to field-certified routes.
          </p>
        </div>
      </div>
      <Footer />
      {selected && (
        <Modal title="Dataset inspection" onClose={() => setSelected(null)}>
          <h3 className="dataset-name">{selected.file}</h3>
          <div className="source-facts">
            <div>
              <strong>{selected.records.toLocaleString()} records</strong>
              <small>{humanize(selected.provenance)}</small>
            </div>
            <div>
              <strong>{(selected.bytes / 1024).toFixed(1)} KB</strong>
              <small>Original source preserved</small>
            </div>
          </div>
          {selected.issues.map((i) => (
            <p className="compact" key={i}>
              <Info size={13} /> {i}
            </p>
          ))}
          <p className="compact">
            {catalog[selected.file]?.sample_label || "Source preview"}
          </p>
          <pre className="json-preview">
            {JSON.stringify(
              records?.records ||
                catalog[selected.file]?.sample || {
                  note: "No inline sample; original is retained in the data archive.",
                },
              null,
              2,
            )}
          </pre>
          <div className="row spread">
            <button
              className="button secondary"
              disabled={loading || (records && offset + 10 >= records.total)}
              onClick={() => loadRecords(records ? offset + 10 : 0)}
            >
              {loading
                ? "Loading…"
                : records
                  ? "Next 10 records"
                  : "Browse full dataset"}
            </button>
            {records && (
              <button
                className="button secondary"
                disabled={offset === 0 || loading}
                onClick={() => loadRecords(Math.max(0, offset - 10))}
              >
                Previous
              </button>
            )}
          </div>
          {records && (
            <p className="compact muted">
              Records {offset + 1}–{Math.min(offset + 10, records.total)} of{" "}
              {records.total} · original supplied values
            </p>
          )}
          {recordError && <p className="error-text">{recordError}</p>}
          <p className="compact" style={{ marginTop: 18 }}>
            Original SHA-256
          </p>
          <p className="hash">{selected.sha256}</p>
          <button
            className="text-link"
            onClick={() => {
              downloadJSON(`${selected.file}-audit.json`, {
                ...selected,
                sample: catalog[selected.file],
              });
              notify("Dataset metadata and source sample exported.");
            }}
          >
            Export audit record
            <Download size={13} />
          </button>
        </Modal>
      )}
    </div>
  );
}
