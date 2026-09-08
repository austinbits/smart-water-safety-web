const configured = import.meta.env.VITE_API_URL || "";
export const API_URL = /your_render_url|YOUR_|example/.test(configured)
  ? ""
  : configured.replace(/\/$/, "");
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_URL ||
  (import.meta.env.PROD
    ? "https://smart-water-safety-backend.onrender.com"
    : window.location.origin);
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`sws:${key}`);
      return v ? JSON.parse(v) : fallback;
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
export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    credentials: "include",
    signal: options.signal || AbortSignal.timeout(60000),
    headers: {
      "Content-Type": "application/json",
      ...(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sws-workspace') ? {'X-Workspace-Key':sessionStorage.getItem('sws-workspace')} : {}),
      ...(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sws-auth') ? {Authorization:'Bearer '+sessionStorage.getItem('sws-auth')} : {}),
      ...(storage.get("demo-token", null)
        ? { "X-Demo-Session": storage.get("demo-token", null) }
        : {}),
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
export function downloadJSON(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
