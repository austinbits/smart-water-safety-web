import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
test("all 64 source files are archived byte-for-byte and all original KML downloads match", () => {
  const m = read("data/manifest.json");
  assert.equal(m.length, 64);
  for (const f of m) {
    const data = fs.readFileSync(
      path.join(root, "data/source", f.site, f.file),
    );
    assert.equal(createHash("sha256").update(data).digest("hex"), f.sha256);
    if (f.file.endsWith(".kml"))
      assert.equal(
        createHash("sha256")
          .update(
            fs.readFileSync(
              path.join(root, `frontend/public/data/kml/${f.site}.kml`),
            ),
          )
          .digest("hex"),
        f.sha256,
      );
  }
});
test("all pilot bundles and corrected beach GPS are in the intended geographic bounds", () => {
  for (const id of ["calangute", "muthathi", "dudhsagar"]) {
    const s = read(`frontend/public/data/${id}.json`);
    assert.ok(s.routes_count > 0);
    assert.equal(s.replay.length, 61);
    assert.ok(s.timeline.length >= 48);
    for (const frame of s.replay)
      for (const p of frame) {
        assert.ok(
          p.lng >= s.bounds[0] && p.lng <= s.bounds[2],
          `${id} longitude`,
        );
        assert.ok(
          p.lat >= s.bounds[1] && p.lat <= s.bounds[3],
          `${id} latitude`,
        );
      }
    assert.equal(
      s.features.features.some((f) => f.properties.verification === "verified"),
      false,
    );
  }
  const beach = read("frontend/public/data/calangute.json");
  assert.equal(
    beach.features.features.some((f) => f.properties.name === "Polygon 1"),
    false,
  );
  assert.ok(beach.corrections.gps_records_regenerated > 29000);
});
test("missing local river measurements are not filled with reservoir stage or discharge", () => {
  const river = read("frontend/public/data/muthathi.json");
  assert.ok(
    river.timeline.every(
      (r) => r.water_level === null && r.flow_speed === null,
    ),
  );
  const beach = read("frontend/public/data/calangute.json");
  assert.ok(
    beach.timeline.some(
      (r) => Number.isFinite(r.wave_height) && r.wave_height > 0,
    ),
  );
  assert.ok(beach.timeline.every((r) => r.wind >= 0));
  const falls = read("frontend/public/data/dudhsagar.json");
  assert.ok(
    falls.history.every((i) => i.verification === "official_document_checked"),
  );
});
