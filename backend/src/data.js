const fs = require("node:fs");
const path = require("node:path");

// The backend deliberately reads the same prepared data that the frontend uses.
// This prevents the two applications from presenting different site geometry.
const root = path.resolve(__dirname, "../../frontend/public/data");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const sites = Object.fromEntries(
  manifest.sites.map((siteSummary) => [
    siteSummary.id,
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `../../data/normalized/${siteSummary.id}.json`),
        "utf8",
      ),
    ),
  ]),
);

/** Find a site using either its readable string ID or its numeric database ID. */
function siteById(id) {
  return (
    sites[id] ||
    Object.values(sites).find((site) => String(site.site_id) === String(id))
  );
}

module.exports = { manifest, sites, siteById, root };
