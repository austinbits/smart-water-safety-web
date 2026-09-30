import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";

import { initialState } from "../../../shared/demo.mjs";
import { distance, riskFor } from "../../../shared/engine.mjs";
import { API_URL, api, storage } from "../services/api";
import { useAuth } from "./auth-context";
import { Context } from "./water-context";
import {
  buildDemoVisitors,
  buildDisplayFeatures,
  buildVisiblePeople,
  CLOSED_INCIDENT_STATUSES,
  findReplayStart,
  getEmergencyDemoPosition,
  getMapPosition,
  getPositionZone,
  getTimelineSample,
} from "./water-helpers";

/**
 * Own all water-safety workspace state and expose it to page components.
 * Pages consume this provider instead of repeating networking, GPS, replay, and
 * emergency logic independently.
 */
export function WaterProvider({ children }) {
  const { user, admin } = useAuth();

  // Data loaded from static files and the backend.
  const [replay, setReplay] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [bundles, setBundles] = useState({});
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState(() => initialState());

  // User selections and playback controls.
  const [siteId, setSiteId] = useState(() => storage.get("site", "calangute"));
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState("");

  // Browser and connection capabilities.
  const [online, setOnline] = useState(navigator.onLine);
  const [connection, setConnection] = useState("connecting");
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [location, setLocation] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [trace, setTrace] = useState([]);

  // Values persisted in browser storage survive page reloads.
  const [savedSites, setSavedSites] = useState(() =>
    storage.get("offline-sites", []),
  );
  const [pending] = useState(() => storage.get("pending", []));
  const [emergency, setEmergency] = useState(() =>
    storage.get("emergency", null),
  );
  const [now, setNow] = useState(Date.now());

  // Refs hold mutable integration state without causing extra rendering.
  const escalationId = useRef(null);
  const lastPositionSent = useRef(0);
  const geolocationWatchId = useRef(null);
  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const actionChain = useRef(Promise.resolve());

  stateRef.current = state;
  pendingRef.current = pending;

  // Load the compact public bundles that make the site usable offline.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/data/manifest.json");
        if (!response.ok) {
          throw new Error("Data manifest could not be loaded.");
        }

        const loadedManifest = await response.json();
        const values = await Promise.all(
          loadedManifest.sites.map(async (siteSummary) => {
            const siteResponse = await fetch(`/data/${siteSummary.id}.json`);
            if (!siteResponse.ok) {
              throw new Error(`${siteSummary.name} data could not be loaded.`);
            }
            return [siteSummary.id, await siteResponse.json()];
          }),
        );
        if (active) {
          setManifest(loadedManifest);
          setBundles(Object.fromEntries(values));
        }
      } catch (error) {
        if (active) setLoadError(error.message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep small pieces of user state in local storage.
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

  // Escalate a completed countdown exactly once, even if React renders again.
  const escalate = useEffectEvent((current) => {
    escalationId.current = current.id;
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
      .catch((error) => {
        notify(error.message);
        escalationId.current = null;
      });
  });
  useEffect(() => {
    if (
      emergency?.status !== "countdown" ||
      now < emergency.deadline ||
      escalationId.current === emergency.id
    ) {
      return;
    }
    escalate(emergency);
  }, [now, emergency]);

  // If a browser-restored countdown was cancelled, reconcile it with the server.
  const reconcileCancelled = useEffectEvent((current) =>
    dispatch(
      "cancel",
      { id: current.id, site: current.site },
      `${current.id}-cancel`,
    ).catch((error) => notify(error.message)),
  );
  useEffect(() => {
    if (
      emergency?.status === "cancelled" &&
      state.incidents.some(
        (incident) =>
          incident.id === emergency.id &&
          !CLOSED_INCIDENT_STATUSES.has(incident.status),
      )
    ) {
      reconcileCancelled(emergency);
    }
  }, [state, emergency]);

  // Mirror the browser's current network status in application state.
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Advance the forecast replay while the user has playback enabled.
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
      if (geolocationWatchId.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchId.current);
      }
    },
    [],
  );

  // Receive immediate room updates. The secure workspace cookie lets the
  // browser authenticate this stream without placing a secret in the URL.
  useEffect(() => {
    const events = new EventSource(`${API_URL}/api/workspace/events`, {
      withCredentials: true,
    });
    events.addEventListener("ready", () => setConnection("realtime"));
    events.addEventListener("workspace", (event) => {
      try {
        const nextState = JSON.parse(event.data);
        stateRef.current = nextState;
        setState(nextState);
        setConnection("realtime");
        setSyncedAt(Date.now());
      } catch {
        // A malformed event is ignored; the fallback poll repairs state.
      }
    });
    return () => events.close();
  }, [user.id]);

  // Slow polling is a recovery path if a proxy or browser blocks event streams.
  useEffect(() => {
    let active = true;
    let timer;

    async function poll() {
      try {
        const response = await api("/workspace/state");
        if (active) {
          setState(response.state);
          stateRef.current = response.state;
          setConnection(response.storage);
          setSyncedAt(Date.now());
        }
      } catch (error) {
        if (active) {
          setConnection("device");
          if (error.status === 401) {
            setLoadError("Session expired. Sign out and sign in again.");
          }
        }
      } finally {
        if (active) timer = setTimeout(poll, 15000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user.id]);

  // Administrators can replay anonymized demo movement for the selected site.
  useEffect(() => {
    let active = true;

    if (admin && user.demo) {
      api("/workspace/replay/" + siteId)
        .then((loadedReplay) => {
          if (active) setReplay(loadedReplay);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [siteId, admin, user.demo]);

  /** Serialize state-changing requests so rapid clicks cannot arrive out of order. */
  function dispatch(action, payload = {}, eventId = crypto.randomUUID()) {
    const operation = actionChain.current.then(async () => {
      const response = await api("/workspace/action", {
        method: "POST",
        body: JSON.stringify({ action, payload, eventId }),
      });
      stateRef.current = response.state;
      setState(response.state);
      setConnection(response.storage);
      setSyncedAt(Date.now());
      return response.state;
    });
    actionChain.current = operation.catch(() => {});
    return operation;
  }
  // Derive map-ready values from source data instead of storing duplicate state.
  const site = bundles[siteId] || bundles.calangute;
  const scenario = state.scenarios[siteId] || "normal";
  const replayStart = findReplayStart(site);
  const sample = getTimelineSample(site, replayStart, frame);
  const risk = useMemo(
    () => (site ? riskFor(site, sample, scenario) : null),
    [site, sample, scenario],
  );
  const features = useMemo(
    () =>
      buildDisplayFeatures({
        frame,
        replayStart,
        sample,
        scenario,
        site,
      }),
    [frame, replayStart, sample, scenario, site],
  );
  const replayVisitors = buildDemoVisitors(replay, frame, admin && user.demo);
  const people = buildVisiblePeople({
    admin,
    replayVisitors,
    siteId,
    state,
  });
  const position = getMapPosition(location, site);
  const zone = getPositionZone(position, features);

  /** Show a temporary message without exposing toast implementation to pages. */
  const notify = (message) => setToast(message);

  /** Request one location or begin a consented route trace. */
  function locate(record = false) {
    if (!navigator.geolocation) {
      notify("Location is not supported by this browser.");
      return;
    }
    const handleSuccess = (browserPosition) => {
      const loc = {
        lat: browserPosition.coords.latitude,
        lng: browserPosition.coords.longitude,
        accuracy: browserPosition.coords.accuracy,
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
        }).catch((error) => notify(error.message));
      }
      if (record) {
        setTrace((positions) => {
          const last = positions.at(-1);
          return !last || distance(last, [loc.lng, loc.lat]) > 3
            ? [...positions, [loc.lng, loc.lat]].slice(-10000)
            : positions;
        });
      }
    };

    const handleError = (error) => {
      notify(
        error.code === 1
          ? "Location permission was declined. You can continue with the demo position."
          : "GPS is unavailable. Try again outdoors.",
      );
      if (record) stopTrace();
    };

    if (record || !admin) {
      setTracking(record);
      setTrace([]);
      if (geolocationWatchId.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchId.current);
      }
      geolocationWatchId.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 15000,
        },
      );
    } else {
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 15000,
      });
    }
  }

  /** Stop the browser location watcher without deleting the collected trace. */
  function stopTrace() {
    if (geolocationWatchId.current !== null) {
      navigator.geolocation.clearWatch(geolocationWatchId.current);
    }
    geolocationWatchId.current = null;
    setTracking(false);
  }

  /** Start a labelled emergency drill; real emergency services are never contacted. */
  function startEmergency(level = "high") {
    const previousEmergencyIsClosed = stateRef.current.incidents.some(
      (incident) =>
        incident.id === emergency?.id &&
        CLOSED_INCIDENT_STATUSES.has(incident.status),
    );
    if (
      emergency &&
      ["countdown", "active"].includes(emergency.status) &&
      !previousEmergencyIsClosed
    ) {
      notify(
        "An emergency drill is already active. Finish or cancel it first.",
      );
      return;
    }

    const demoPosition = getEmergencyDemoPosition(features, site.center);
    const emergencyRecord = {
      id: crypto.randomUUID(),
      site: siteId,
      zone: level,
      position: demoPosition,
      deadline: Date.now() + 30000,
      status: level === "low" ? "awareness" : "countdown",
    };
    setEmergency(emergencyRecord);
    setNow(Date.now());
    escalationId.current = null;
  }

  /** Cancel either a visible server incident or a countdown that never escalated. */
  async function cancelEmergency() {
    if (!emergency) return;

    const current = emergency;
    setEmergency({ ...current, status: "cancelled" });
    storage.set("emergency", { ...current, status: "cancelled" });
    await actionChain.current;

    if (
      stateRef.current.incidents.some(
        (incident) =>
          incident.id === current.id &&
          !CLOSED_INCIDENT_STATUSES.has(incident.status),
      )
    ) {
      await dispatch(
        "cancel",
        { id: current.id, site: current.site },
        `${current.id}-cancel`,
      );
    } else {
      await dispatch(
        "cancel_countdown",
        { site: current.site },
        `${current.id}-cancel-countdown`,
      );
    }
  }

  /** Cache the current site's essential files for limited offline use. */
  async function saveOffline() {
    try {
      if (!("caches" in window)) {
        throw new Error("Offline storage requires HTTPS or localhost.");
      }

      const cache = await caches.open("sws-offline-v1");
      await cache.addAll([
        "/",
        "/data/manifest.json",
        `/data/${siteId}.json`,
        site.kml_url,
      ]);
      const paths = performance
        .getEntriesByType("resource")
        .map((resource) => resource.name)
        .filter(
          (url) =>
            url.startsWith(window.location.origin) &&
            /\.(js|css)(\?|$)|\/src\/|\/node_modules\//.test(url),
        );
      await Promise.allSettled(paths.map((url) => cache.add(url)));
      const saved = [...new Set([...savedSites, siteId])];
      setSavedSites(saved);
      storage.set("offline-sites", saved);
      notify(
        "Site paths and candidate locations saved. Offline maps use these vector layers; street tiles need internet.",
      );
    } catch (error) {
      notify(error.message || "Offline download failed.");
    }
  }

  // This is the single public interface pages receive from the provider.
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
