import { Suspense, lazy } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  Check,
  CloudSun,
  Compass,
  LogOut,
  Radio,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

import "./App.css";
import LoginPage from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./store/auth-context";
import { useWater } from "./store/water-context";
import { WaterProvider } from "./store/WaterContext";
import "./modes.css";
import "./upgrade.css";
import "./map-focus.css";

import ExplorePage from "./pages/ExplorePage";

const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const EmergencyPage = lazy(() => import("./pages/EmergencyPage"));
const RescueDashboard = lazy(() => import("./pages/RescueDashboard"));
const DataPage = lazy(() => import("./pages/DataPage"));

// Each entry contains the URL, the visible label, and the icon component.
// Keeping navigation in one table prevents desktop and mobile menus from drifting apart.
const NAVIGATION_ITEMS = [
  ["/explore", "Map", Compass],
  ["/forecast", "Safety", CloudSun],
  ["/emergency", "Emergency", ShieldAlert],
  ["/dashboard", "Rescue console", Radio],
];

const CLOSED_INCIDENT_STATUSES = new Set(["resolved", "cancelled"]);

/** Convert technical connection state into a short message for ordinary users. */
function getConnectionLabel({ connection, offlineDemo, online }) {
  if (!online || offlineDemo) return "Offline demo";

  const labels = {
    connecting: "Connecting…",
    server: "API connected",
    supabase: "Supabase connected",
  };

  return labels[connection] ?? "Device demo";
}

/** Render the signed-in application frame shared by every page. */
function Shell() {
  const { user, admin, logout } = useAuth();
  const navigationItems = NAVIGATION_ITEMS.filter(([path]) =>
    admin ? path !== "/emergency" : path !== "/dashboard",
  );
  const {
    site,
    loadError,
    connection,
    online,
    offlineDemo,
    toast,
    state,
    siteId,
  } = useWater();
  const location = useLocation();
  const usesDarkTheme = ["/dashboard", "/emergency"].includes(
    location.pathname,
  );
  const activeIncidentCount = state.incidents.filter(
    (incident) => !CLOSED_INCIDENT_STATUSES.has(incident.status),
  ).length;
  const connectionLabel = getConnectionLabel({
    connection,
    offlineDemo,
    online,
  });

  return (
    <div className={`app-shell ${usesDarkTheme ? "dark-mode" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/explore" className="brand" aria-label="Open map">
          <Compass size={25} />
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {navigationItems.map(([to, label, Icon]) => (
            <NavLink key={to} to={to}>
              <Icon size={21} />
              <span>{label}</span>
              {to === "/dashboard" && activeIncidentCount > 0 && (
                <span className="nav-count">{activeIncidentCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="rail-logout" onClick={logout} title="Sign out">
            <LogOut size={20} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <strong>{site?.name}</strong>
            <span>·</span>
            {NAVIGATION_ITEMS.find(
              ([path]) => path === location.pathname,
            )?.[1] || "Details"}
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span
                className={`status-dot ${connection === "device" ? "muted" : ""}`}
              />
              {connectionLabel}
            </span>
            {user.demo && (
              <span className="demo-label">
                <Activity size={14} /> Drill
              </span>
            )}
          </div>
        </header>
        {(!online || offlineDemo) && (
          <div className="offline-banner">
            <WifiOff size={17} />
            Offline mode · cached map layers · SOS stays queued until connection
            returns
          </div>
        )}
        {state.scenarios[siteId] === "danger" &&
          location.pathname !== "/emergency" && (
            <Link
              className="scenario-alert"
              to={admin ? "/dashboard" : "/emergency"}
            >
              <ShieldAlert size={18} />
              High-risk scenario at {site?.name}. Open response.
            </Link>
          )}
        {user.demo && (
          <div className="drill-banner">
            Drill code <strong>{user.code}</strong>
            <button onClick={() => navigator.clipboard.writeText(user.code)}>
              Copy code
            </button>
          </div>
        )}
        {!admin &&
          state.messages
            .filter((message) => message.site === siteId)
            .slice(-1)
            .map((message) => (
              <div className="drill-banner" role="status" key={message.id}>
                <strong>Rescue advisory</strong>
                {message.text}
              </div>
            ))}
        <main id="main-content" tabIndex={-1}>
          {loadError ? (
            <div className="load-state">
              <ShieldAlert />
              <h1>Couldn’t load site data</h1>
              <p>{loadError}</p>
              <button onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : !site ? (
            <div className="load-state">
              <span className="loader" />
              <p>Preparing map…</p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="load-state">
                  <span className="loader" />
                  Loading workspace…
                </div>
              }
            >
              <Routes>
                <Route path="/explore" element={<ExplorePage key={siteId} />} />
                <Route
                  path="/forecast"
                  element={<ForecastPage key={siteId} />}
                />
                <Route
                  path="/emergency"
                  element={
                    !admin ? (
                      <EmergencyPage key={siteId} />
                    ) : (
                      <Navigate to="/dashboard" replace />
                    )
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    admin ? (
                      <RescueDashboard key={siteId} />
                    ) : (
                      <Navigate to="/explore" replace />
                    )
                  }
                />
                <Route
                  path="/data"
                  element={
                    admin ? (
                      <DataPage key={siteId} />
                    ) : (
                      <Navigate to="/explore" replace />
                    )
                  }
                />
                <Route
                  path="*"
                  element={
                    <Navigate to={admin ? "/dashboard" : "/explore"} replace />
                  }
                />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigationItems.map(([to, label, Icon]) => (
          <NavLink key={to} to={to}>
            <Icon size={22} />
            <span>{label.replace(" console", "")}</span>
          </NavLink>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
    </div>
  );
}

/** Keep data providers behind the sign-in gate so they never run for anonymous users. */
function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="load-state">Preparing your workspace…</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <WaterProvider key={user.id}>
      <Shell />
    </WaterProvider>
  );
}

/** Application entry point: browser routing wraps authentication and site data. */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
