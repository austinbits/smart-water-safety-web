const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../frontend/public/data");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const sites = Object.fromEntries(
  manifest.sites.map((s) => [
    s.id,
    JSON.parse(fs.readFileSync(path.join(root, `${s.id}.json`), "utf8")),
  ]),
);
function siteById(id) {
  return (
    sites[id] ||
    Object.values(sites).find((s) => String(s.site_id) === String(id))
  );
}
module.exports = { manifest, sites, siteById, root };
