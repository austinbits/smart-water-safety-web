import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";
import { api, storage } from "../services/api";
import { initialState } from "../../../shared/demo.mjs";
import {
  riskFor,
  dynamicFeatures,
  classifyPosition,
  distance,
} from "../../../shared/engine.mjs";
import { Context } from "./water-context";
import { zoneForecast } from "../../../shared/navigation.mjs";
import { useAuth } from "./auth-context";
export function WaterProvider({ children }) {
  const { user, admin } = useAuth();
  const [replay, setReplay] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [manifest, setManifest] = useState(null),
    [bundles, setBundles] = useState({}),
    [loadError, setLoadError] = useState("");
  const [siteId, setSiteId] = useState(() => storage.get("site", "calangute")),
    [state, setState] = useState(() => initialState());
  const [online, setOnline] = useState(navigator.onLine),
    [connection, setConnection] = useState("connecting"),
    [retry] = useState(0);
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [toast, setToast] = useState("");
  const [location, setLocation] = useState(null),
    [tracking, setTracking] = useState(false),
    [trace, setTrace] = useState([]);
  const [savedSites, setSavedSites] = useState(() =>
    storage.get("offline-sites", []),
  );
  const [offlineDemo, setOfflineDemo] = useState(false),
    [pending] = useState(() => storage.get("pending", []));
  const [emergency, setEmergency] = useState(() =>
      storage.get("emergency", null),
    ),
    [now, setNow] = useState(Date.now());
  const escalation = useRef(null);
  const lastPositionSent = useRef(0);
  const watch = useRef(null),
    stateRef = useRef(state),
    pendingRef = useRef(pending),
    actionChain = useRef(Promise.resolve());
  stateRef.current = state;
  pendingRef.current = pending;
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/data/manifest.json");
        if (!r.ok) throw new Error("Data manifest could not be loaded.");
        const m = await r.json();
        const values = await Promise.all(
          m.sites.map(async (s) => {
            const r = await fetch(`/data/${s.id}.json`);
            if (!r.ok) throw new Error(`${s.name} data could not be loaded.`);
            return [s.id, await r.json()];
          }),
        );
        if (active) {
          setManifest(m);
          setBundles(Object.fromEntries(values));
        }
      } catch (e) {
        if (active) setLoadError(e.message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    storage.set("site", siteId);
  }, [siteId]);
  function changeSite(id) {
    setSiteId(id);
    setFrame(0);
    setPlaying(false);
  }
  useEffect(() => {
    storage.set("pending", pending);
  }, [pending]);
  useEffect(() => {
    storage.set("emergency", emergency);
  }, [emergency]);
  useEffect(() => {
    if (emergency?.status !== "countdown") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [emergency]);
  const escalate = useEffectEvent((current) => {
    escalation.current = current.id;
    dispatch(
      "sos",
      {
        site: current.site,
        lng: current.position[0],
        lat: current.position[1],
        zone: current.zone,
        note: "Automatic escalation of a user-started emergency drill",
      },
      current.id,
    )
      .then(() =>
        setEmergency((e) =>
          e?.id === current.id && e.status === "countdown"
            ? { ...e, status: "active" }
            : e,
        ),
      )
      .catch((e) => {
        notify(e.message);
        escalation.current = null;
      });
  });
  useEffect(() => {
    if (
      emergency?.status !== "countdown" ||
      now < emergency.deadline ||
      escalation.current === emergency.id
    )
      return;
    escalate(emergency);
  }, [now, emergency]);
  const reconcileCancelled = useEffectEvent((current) =>
    dispatch(
      "cancel",
      { id: current.id, site: current.site },
      `${current.id}-cancel`,
    ).catch((e) => notify(e.message)),
  );
  useEffect(() => {
    if (
      emergency?.status === "cancelled" &&
      state.incidents.some(
        (i) =>
          i.id === emergency.id &&
          !["resolved", "cancelled"].includes(i.status),
      )
    )
      reconcileCancelled(emergency);
  }, [state, emergency]);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setFrame((f) => {
          if (f >= 60) {
            setPlaying(false);
            return 60;
          }
          return f + 1;
        }),
      1500,
    );
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );
  useEffect(() => {
    let active = true,
      timer;
    async function poll() {
      try {
        const d = await api("/workspace/state");
        if (active) {
          setState(d.state);
          stateRef.current = d.state;
          setConnection(d.storage);
          setSyncedAt(Date.now());
        }
      } catch (e) {
        if (active) {
          setConnection("device");
          if (e.status === 401)
            setLoadError("Session expired. Sign out and sign in again.");
        }
      } finally {
        if (active) timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user.id, retry]);
  useEffect(() => {
    let active = true;
    if (admin && user.demo)
      api("/workspace/replay/" + siteId)
        .then((d) => {
          if (active) setReplay(d);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [siteId, admin, user.demo]);
  function dispatch(action, payload = {}, eventId = crypto.randomUUID()) {
    const operation = actionChain.current.then(async () => {
      const d = await api("/workspace/action", {
        method: "POST",
        body: JSON.stringify({ action, payload, eventId }),
      });
      stateRef.current = d.state;
      setState(d.state);
      setConnection(d.storage);
      setSyncedAt(Date.now());
      return d.state;
    });
    actionChain.current = operation.catch(() => {});
    return operation;
  }
  const site = bundles[siteId] || bundles.calangute,
    scenario = state.scenarios[siteId] || "normal";
  const baselineIndex = site
    ? Math.max(
        0,
        site.timeline.findIndex((t) => t.timestamp.startsWith("2026-09-07T12")),
      )
    : 0;
  const sample =
    site?.timeline[
      Math.min(site.timeline.length - 1, baselineIndex + Math.floor(frame / 3))
    ];
  const risk = useMemo(
    () => (site ? riskFor(site, sample, scenario) : null),
    [site, sample, scenario],
  );
  const features = useMemo(() => {
    if (!site) return null;
    const base = dynamicFeatures(site, scenario);
    const zones = zoneForecast(
      site,
      sample,
      site.timeline[Math.max(0, baselineIndex + Math.floor(frame / 3) - 1)],
      scenario,
    );
    return {
      ...base,
      features: base.features.map((f) => {
        const z = zones.find((z) => z.id === f.properties.id);
        return z
          ? {
              ...f,
              properties: {
                ...f.properties,
                display_level: z.level,
                rising: z.rising,
                ...(f.properties.category === "hazard"
                  ? { level: z.level }
                  : {}),
              },
            }
          : f;
      }),
    };
  }, [site, scenario, sample, baselineIndex, frame]);
  const names = [
    "Aarav",
    "Diya",
    "Ishaan",
    "Meera",
    "Rohan",
    "Ananya",
    "Kabir",
    "Nisha",
  ];
  const simulated = (admin && user.demo ? replay[frame] || [] : []).map(
    (p, i) => ({
      ...p,
      name: names[i % names.length] + " (demo)",
      age: 19 + (i % 38),
      source: "simulation",
    }),
  );
  const people = admin
    ? [
        ...simulated,
        ...(state.visitors || []).filter((v) => v.site === siteId),
        ...state.teams
          .filter((t) => t.site === siteId && Number.isFinite(t.lng))
          .map((t) => ({ ...t, role: "team" })),
      ]
    : state.teams
        .filter((t) => t.site === siteId && Number.isFinite(t.lng))
        .map((t) => ({ ...t, role: "team" }));
  const demoPosition = null;
  const position = location
    ? [location.lng, location.lat]
    : demoPosition
      ? [demoPosition.lng, demoPosition.lat]
      : site?.planning_start || site?.center;
  const zone = features
    ? classifyPosition(position, features.features)
    : "unknown";
  const notify = (m) => setToast(m);
  function locate(record = false) {
    if (!navigator.geolocation) {
      notify("Location is not supported by this browser.");
      return;
    }
    const success = (p) => {
      const loc = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: new Date().toISOString(),
      };
      setLocation(loc);
      if (!admin && Date.now() - lastPositionSent.current > 5000) {
        lastPositionSent.current = Date.now();
        dispatch("position", {
          ...loc,
          site: siteId,
          accuracy_m: loc.accuracy,
          consent: true,
        }).catch((e) => notify(e.message));
      }
      if (record)
        setTrace((ps) => {
          const last = ps.at(-1);
          return !last || distance(last, [loc.lng, loc.lat]) > 3
            ? [...ps, [loc.lng, loc.lat]].slice(-10000)
            : ps;
        });
    };
    const error = (e) => {
      notify(
        e.code === 1
          ? "Location permission was declined. You can continue with the demo position."
          : "GPS is unavailable. Try again outdoors.",
      );
      if (record) stopTrace();
    };
    if (record || !admin) {
      setTracking(record);
      setTrace([]);
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
      watch.current = navigator.geolocation.watchPosition(success, error, {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      });
    } else
      navigator.geolocation.getCurrentPosition(success, error, {
        enableHighAccuracy: true,
        timeout: 15000,
      });
  }
  function stopTrace() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setTracking(false);
  }
  function startEmergency(level = "high") {
    const closed = stateRef.current.incidents.some(
      (i) =>
        i.id === emergency?.id && ["resolved", "cancelled"].includes(i.status),
    );
    if (
      emergency &&
      ["countdown", "active"].includes(emergency.status) &&
      !closed
    ) {
      notify(
        "An emergency drill is already active. Finish or cancel it first.",
      );
      return;
    }
    const hazard = features.features.find(
      (f) =>
        f.properties.category === "hazard" && f.geometry.type === "Polygon",
    );
    const ring = hazard?.geometry.coordinates[0];
    const demo = ring
      ? ring.reduce(
          (a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length],
          [0, 0],
        )
      : site.center;
    const record = {
      id: crypto.randomUUID(),
      site: siteId,
      zone: level,
      position: demo,
      deadline: Date.now() + 30000,
      status: level === "low" ? "awareness" : "countdown",
    };
    setEmergency(record);
    setNow(Date.now());
    escalation.current = null;
  }
  async function cancelEmergency() {
    if (!emergency) return;
    const current = emergency;
    setEmergency({ ...current, status: "cancelled" });
    storage.set("emergency", { ...current, status: "cancelled" });
    await actionChain.current;
    if (
      stateRef.current.incidents.some(
        (i) =>
          i.id === current.id && !["resolved", "cancelled"].includes(i.status),
      )
    )
      await dispatch(
        "cancel",
        { id: current.id, site: current.site },
        `${current.id}-cancel`,
      );
    else
      await dispatch(
        "cancel_countdown",
        { site: current.site },
        `${current.id}-cancel-countdown`,
      );
  }
  async function saveOffline() {
    try {
      if (!("caches" in window))
        throw new Error("Offline storage requires HTTPS or localhost.");
      const cache = await caches.open("sws-offline-v1");
      await cache.addAll([
        "/",
        "/data/manifest.json",
        `/data/${siteId}.json`,
        site.kml_url,
      ]);
      const paths = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .filter(
          (u) =>
            u.startsWith(window.location.origin) &&
            /\.(js|css)(\?|$)|\/src\/|\/node_modules\//.test(u),
        );
      await Promise.allSettled(paths.map((u) => cache.add(u)));
      const saved = [...new Set([...savedSites, siteId])];
      setSavedSites(saved);
      storage.set("offline-sites", saved);
      notify(
        "Site paths and candidate locations saved. Offline maps use these vector layers; street tiles need internet.",
      );
    } catch (e) {
      notify(e.message || "Offline download failed.");
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        admin,
        syncedAt,
        sample,
        manifest,
        bundles,
        siteId,
        setSiteId: changeSite,
        site,
        loadError,
        state,
        dispatch,
        online,
        connection,
        frame,
        setFrame,
        playing,
        setPlaying,
        toast,
        notify,
        scenario,
        risk,
        features,
        people,
        position,
        zone,
        location,
        locate,
        tracking,
        trace,
        stopTrace,
        savedSites,
        saveOffline,
        offlineDemo,
        setOfflineDemo,
        pending,
        emergency,
        startEmergency,
        cancelEmergency,
        clearEmergency: () => setEmergency(null),
        countdown: emergency
          ? Math.max(0, Math.ceil((emergency.deadline - now) / 1000))
          : 0,
      }}
    >
      {children}
    </Context.Provider>
  );
}
