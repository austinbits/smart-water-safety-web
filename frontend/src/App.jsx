import { Suspense, lazy } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  Waves,
  Compass,
  CloudSun,
  ShieldAlert,
  Radio,
  Database,
  ArrowUpRight,
  WifiOff,
  Check,
  Activity,
} from "lucide-react";
import { WaterProvider } from "./store/WaterContext";
import { useWater } from "./store/water-context";
import ExplorePage from "./pages/ExploreV2";
import "./App.css";
import "./upgrade.css";
import LoginPage from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./store/auth-context";
import "./modes.css";
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const EmergencyPage = lazy(() => import("./pages/EmergencyV2"));
const RescueDashboard = lazy(() => import("./pages/RescueV2"));
const DataPage = lazy(() => import("./pages/DataPage"));
const items = [
  ["/explore", "Explore", Compass],
  ["/forecast", "Forecast", CloudSun],
  ["/emergency", "Emergency", ShieldAlert],
  ["/dashboard", "Rescue console", Radio],
];
function Shell() {
  const { user, admin, logout } = useAuth();
  const navItems = items.filter((i) =>
    admin ? i[0] !== "/emergency" : i[0] !== "/dashboard",
  );
  const {
    site,
    loadError,
    connection,
    online,
    offlineDemo,
    toast,
    manifest,
    state,
    siteId,
  } = useWater();
  const location = useLocation();
  const dark = ["/dashboard", "/emergency"].includes(location.pathname);
  const active = state.incidents.filter(
    (i) => !["resolved", "cancelled"].includes(i.status),
  ).length;
  return (
    <div className={`app-shell ${dark ? "dark-mode" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/explore" className="brand">
          <span className="brand-mark">
            <Waves size={25} />
          </span>
          <span>
            Smart Water<span className="brand-sub">SAFETY & NAVIGATION</span>
          </span>
        </Link>
        <div className="nav-label">YOUR WATER SAFETY NETWORK</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(([to, label, Icon]) => (
            <NavLink key={to} to={to}>
              <Icon size={21} />
              <span>{label}</span>
              {to === "/dashboard" && active > 0 && (
                <span className="nav-count">{active}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-divider" />
        {admin && (
          <NavLink className="data-nav" to="/data">
            <Database size={20} />
            Data & sources
            <ArrowUpRight size={16} />
          </NavLink>
        )}
        <div className="sidebar-bottom">
          <div className="network-art">
            <Waves size={31} />
            <span />
            <span />
            <span />
          </div>
          <h3>Prepared. Connected.</h3>
          <p>
            Three landscapes.
            <br />
            One safety network.
          </p>
          <div className="network-status">
            <span className="status-dot" />
            {manifest
              ? `${manifest.sites.length} pilot sites mapped`
              : "Loading pilot sites"}
          </div>
          <div className="version">
            SIH 2026 <span>PROTOTYPE v2.0</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>
              {items.find((i) => i[0] === location.pathname)?.[1] ||
                "Data & sources"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span
                className={`status-dot ${connection === "device" ? "muted" : ""}`}
              />
              {!online || offlineDemo
                ? "Offline demo"
                : connection === "supabase"
                  ? "Supabase connected"
                  : connection === "server"
                    ? "API connected"
                    : connection === "connecting"
                      ? "Connecting…"
                      : "Device demo"}
            </span>
            <span className="demo-label">
              <Activity size={14} />{" "}
              {user.demo ? "CONNECTED DRILL" : "ACCOUNT WORKSPACE"}
            </span>
            <button className="button secondary" onClick={logout}>
              Sign out
            </button>
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
              High-risk simulation at {site?.name}. Open emergency response{" "}
              <ArrowUpRight size={17} />
            </Link>
          )}
        {user.demo && (
          <div className="drill-banner">
            Connected drill · Share this code with your other dashboard:{" "}
            <strong>{user.code}</strong>
            <button onClick={() => navigator.clipboard.writeText(user.code)}>
              Copy code
            </button>
          </div>
        )}
        {!admin &&
          state.messages
            .filter((m) => m.site === siteId)
            .slice(-1)
            .map((m) => (
              <div className="drill-banner" role="status" key={m.id}>
                <strong>Rescue advisory</strong>
                {m.text}
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
              <p>Preparing your water safety map…</p>
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
        {navItems.map(([to, label, Icon]) => (
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
function Gate() {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="load-state">Preparing your workspace…</div>;
  if (!user) return <LoginPage />;
  return (
    <WaterProvider key={user.id}>
      <Shell />
    </WaterProvider>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
