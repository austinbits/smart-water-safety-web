import fs from "node:fs";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import { initialState, applyAction } from "../../shared/demo.mjs";
import { riskFor, dynamicFeatures } from "../../shared/engine.mjs";

globalThis.window = { location: { origin: "http://127.0.0.1:5173" } };
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const noop = () => {};
try {
  const { Context } = await server.ssrLoadModule("/src/store/water-context.js");
  const manifest = JSON.parse(
    fs.readFileSync("public/data/manifest.json", "utf8"),
  );
  const pages = await Promise.all(
    [
      "ExplorePage",
      "ForecastPage",
      "EmergencyPage",
      "RescueDashboard",
      "DataPage",
    ].map(async (name) => ({
      name,
      Component: (await server.ssrLoadModule(`/src/pages/${name}.jsx`)).default,
    })),
  );
  let count = 0;
  for (const entry of manifest.sites) {
    const site = JSON.parse(
      fs.readFileSync(`public/data/${entry.id}.json`, "utf8"),
    );
    for (const scenario of ["normal", "danger"]) {
      let state = initialState();
      state.scenarios[site.id] = scenario;
      if (scenario === "danger")
        state = applyAction(
          state,
          "sos",
          {
            site: site.id,
            lng: site.center[0],
            lat: site.center[1],
            zone: "high",
          },
          "render-test-incident",
        );
      const value = {
        manifest,
        siteId: site.id,
        site,
        bundles: { [site.id]: site },
        state,
        scenario,
        risk: riskFor(site, site.timeline[0], scenario),
        features: dynamicFeatures(site, scenario),
        people: site.replay[0],
        position: site.center,
        zone: "high",
        connection: "supabase",
        frame: 0,
        trace: [],
        pending: [],
        savedSites: [],
        online: true,
        emergency:
          scenario === "danger"
            ? {
                id: "render-test-incident",
                site: site.id,
                position: site.center,
                status: "active",
                zone: "high",
              }
            : null,
        countdown: 30,
        dispatch: async () => {},
        notify: noop,
        setSiteId: noop,
        locate: noop,
        saveOffline: noop,
        setFrame: noop,
        setPlaying: noop,
        setOfflineDemo: noop,
        startEmergency: noop,
        cancelEmergency: async () => {},
        clearEmergency: noop,
        stopTrace: noop,
      };
      for (const { name, Component } of pages) {
        const html = renderToString(
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(
              Context.Provider,
              { value },
              React.createElement(Component),
            ),
          ),
        );
        assert.ok(html.length > 1000, `${site.id} ${name} empty`);
        assert.ok(
          !html.includes("NaN"),
          `${site.id} ${name} invalid numerical output`,
        );
        count++;
      }
    }
  }
  console.log(
    `Rendered ${count} page/site/scenario combinations without component errors or NaN output.`,
  );
} finally {
  await server.close();
}
