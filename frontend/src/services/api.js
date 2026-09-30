// All browser-to-server communication is centralized here. Components should
// call `api()` instead of assembling URLs, credentials, and error handling.
const configured = import.meta.env.VITE_API_URL || "";

// Placeholder environment values are treated as absent so local development
// continues to use Vite's same-origin proxy.
export const API_URL = /your_render_url|YOUR_|example/.test(configured)
  ? ""
  : configured.replace(/\/$/, "");
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_URL ||
  (import.meta.env.PROD
    ? "https://smart-water-safety-backend.onrender.com"
    : window.location.origin);

/** Safe JSON storage wrapper. Browser privacy settings can make storage throw. */
export const storage = {
  get(key, fallback) {
    try {
      const storedValue = localStorage.getItem(`sws:${key}`);
      return storedValue ? JSON.parse(storedValue) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sws:${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/** Read a temporary browser-session value only when session storage exists. */
function getSessionValue(key) {
  return typeof sessionStorage === "undefined"
    ? null
    : sessionStorage.getItem(key);
}

/**
 * Make an authenticated JSON request to the API.
 * The thrown Error also carries the HTTP status for callers that need it.
 */
export async function api(path, options = {}) {
  const workspaceKey = getSessionValue("sws-workspace");
  const authToken = getSessionValue("sws-auth");
  const demoToken = storage.get("demo-token", null);

  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    credentials: "include",
    signal: options.signal || AbortSignal.timeout(60000),
    headers: {
      "Content-Type": "application/json",
      ...(workspaceKey ? { "X-Workspace-Key": workspaceKey } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(demoToken ? { "X-Demo-Session": demoToken } : {}),
      ...options.headers,
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The API is unavailable. Device demo remains available.");
  }
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Download a JavaScript value as a human-readable JSON file. */
export function downloadJSON(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = name;
  downloadLink.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
