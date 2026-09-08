import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";
import { api, storage, SOCKET_URL } from "../services/api";
import { initialState, applyAction } from "../../../shared/demo.mjs";
import {
  riskFor,
  dynamicFeatures,
  classifyPosition,
  distance,
} from "../../../shared/engine.mjs";
import { Context } from "./water-context";
export function WaterProvider({ children }) {
  const [manifest, setManifest] = useState(null),
    [bundles, setBundles] = useState({}),
    [loadError, setLoadError] = useState("");
  const [siteId, setSiteId] = useState(() => storage.get("site", "calangute")),
    [state, setState] = useState(() =>
      storage.get("workspace", initialState()),
    );
  const [online, setOnline] = useState(navigator.onLine),
    [connection, setConnection] = useState("connecting"),
    [retry, setRetry] = useState(0);
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
    [pending, setPending] = useState(() => storage.get("pending", []));
  const [emergency, setEmergency] = useState(() =>
      storage.get("emergency", null),
    ),
    [now, setNow] = useState(Date.now());
  const escalation = useRef(null);
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
    storage.set("workspace", state);
  }, [state]);
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
    const listener = (e) => {
      if (e.key === "sws:workspace")
        setState(storage.get("workspace", initialState()));
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    if (!online || offlineDemo) return;
    let active = true,
      socket;
    const operation = actionChain.current.then(async () => {
      try {
        const session = await api("/demo/session", {
          method: "POST",
          body: JSON.stringify({ token: storage.get("demo-token", null) }),
        });
        if (!active) return;
        storage.set("demo-token", session.token);
        let updated = session.state;
        for (const event of pendingRef.current) {
          const result = await api("/demo/action", {
            method: "POST",
            body: JSON.stringify(event),
          });
          updated = result.state;
        }
        if (!active) return;
        stateRef.current = updated;
        pendingRef.current = [];
        setState(updated);
        setPending([]);
        storage.set("pending", []);
        setConnection(session.storage === "supabase" ? "supabase" : "server");
        const { io } = await import("socket.io-client");
        if (!active) return;
        socket = io(SOCKET_URL, {
          auth: { demoToken: session.token },
          transports: ["websocket", "polling"],
          reconnectionAttempts: 5,
        });
        socket.on("workspace", (s) => {
          if (active && pendingRef.current.length === 0) {
            stateRef.current = s;
            setState(s);
          }
        });
        socket.io.on("reconnect", () => {
          if (active) setRetry((r) => r + 1);
        });
      } catch {
        if (active) setConnection("device");
      }
    });
    actionChain.current = operation.catch(() => {});
    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [online, offlineDemo, retry]);
  useEffect(() => {
    if (!online || offlineDemo || connection !== "device") return;
    const timer = setTimeout(() => setRetry((r) => r + 1), 15000);
    return () => clearTimeout(timer);
  }, [online, offlineDemo, connection, retry]);
  function dispatch(action, payload = {}, eventId = crypto.randomUUID()) {
    const event = { action, payload, eventId };
    const operation = actionChain.current.then(async () => {
      const next = applyAction(
        stateRef.current,
        action,
        payload,
        event.eventId,
      );
      if (
        online &&
        !offlineDemo &&
        ["supabase", "server"].includes(connection)
      ) {
        try {
          const result = await api("/demo/action", {
            method: "POST",
            body: JSON.stringify(event),
          });
          stateRef.current = result.state;
          setState(result.state);
          return result.state;
        } catch (e) {
          if (
            e.status >= 400 &&
            e.status < 500 &&
            ![401, 408, 429].includes(e.status)
          )
            throw e;
          setConnection("device");
          setToast(`${e.message} Saved on this device for retry.`);
        }
      }
      stateRef.current = next;
      setState(next);
      const queued = [...pendingRef.current, event];
      pendingRef.current = queued;
      setPending(queued);
      if (!storage.set("pending", queued))
        setToast(
          "Device storage is full. Keep this tab open until the actions sync.",
        );
      return next;
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
  const features = useMemo(
    () => (site ? dynamicFeatures(site, scenario) : null),
    [site, scenario],
  );
  const people = site?.replay[frame] || [],
    demoPosition = people.find((p) => p.role === "visitor");
  const position = location
    ? [location.lng, location.lat]
    : demoPosition
      ? [demoPosition.lng, demoPosition.lat]
      : site?.center;
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
    if (record) {
      setTracking(true);
      setTrace([]);
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
