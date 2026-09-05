// frontend/src/pages/RescueDashboard.jsx

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_URL = import.meta.env.VITE_API_URL;

const TEST_EMAIL = 'rescue@example.com';
const TEST_PASSWORD = 'password123';

function RescueDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [email, setEmail] = useState(TEST_EMAIL);
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const savedLogin = localStorage.getItem(
      'rescue_dashboard_logged_in'
    );

    if (savedLogin === 'true') {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = (event) => {
    event.preventDefault();
    setLoginError('');

    if (
      email.trim() === TEST_EMAIL &&
      password === TEST_PASSWORD
    ) {
      localStorage.setItem(
        'rescue_dashboard_logged_in',
        'true'
      );

      setIsLoggedIn(true);
      return;
    }

    setLoginError(
      'Invalid credentials. Use rescue@example.com / password123 for testing.'
    );
  };

  const handleLogout = () => {
    localStorage.removeItem(
      'rescue_dashboard_logged_in'
    );

    setIsLoggedIn(false);
    setEmail(TEST_EMAIL);
    setPassword(TEST_PASSWORD);
    setLoginError('');
  };

  if (!isLoggedIn) {
    return (
      <LoginScreen
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        loginError={loginError}
        onLogin={handleLogin}
      />
    );
  }

  return <Dashboard onLogout={handleLogout} />;
}

// ============================================================
// LOGIN SCREEN
// ============================================================

function LoginScreen({
  email,
  password,
  setEmail,
  setPassword,
  loginError,
  onLogin,
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-8 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-4xl shadow-lg shadow-red-900/40">
            🚨
          </div>

          <h1 className="mt-5 text-3xl font-bold">
            Rescue Operations
          </h1>

          <p className="mt-2 text-sm text-gray-400">
            Emergency response control dashboard
          </p>
        </div>

        <form
          onSubmit={onLogin}
          className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl sm:p-8"
        >
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">
              Rescue Team Login
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Sign in to monitor active emergency operations.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label
                htmlFor="rescue-email"
                className="mb-2 block text-sm font-semibold text-gray-300"
              >
                Email
              </label>

              <input
                id="rescue-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="username"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                placeholder="rescue@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="rescue-password"
                className="mb-2 block text-sm font-semibold text-gray-300"
              >
                Password
              </label>

              <input
                id="rescue-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                placeholder="password123"
              />
            </div>
          </div>

          {loginError && (
            <div className="mt-5 rounded-lg border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-300">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-red-600 px-5 py-3 font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500 active:bg-red-700"
          >
            Login to Dashboard
          </button>

          <div className="mt-5 rounded-lg bg-gray-800/70 p-3 text-center">
            <p className="text-xs text-gray-500">
              Demo credentials
            </p>

            <p className="mt-1 text-xs font-medium text-gray-400">
              rescue@example.com / password123
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD
// ============================================================

function Dashboard({ onLogout }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const sosMarkersRef = useRef([]);
  const teamMarkersRef = useRef([]);

  const [sosCalls, setSosCalls] = useState([]);
  const [rescueTeams, setRescueTeams] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [selectedSOS, setSelectedSOS] = useState(null);

  // ----------------------------------------------------------
  // Fetch dashboard data
  // ----------------------------------------------------------

  const fetchDashboardData = async (
    showLoading = false
  ) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError('');

      if (!API_URL) {
        throw new Error(
          'VITE_API_URL is not configured.'
        );
      }

      const [sosResponse, teamsResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/sos-active`),
          fetch(`${API_URL}/api/rescue-teams`),
        ]);

      if (!sosResponse.ok) {
        throw new Error(
          'Failed to fetch active SOS incidents.'
        );
      }

      if (!teamsResponse.ok) {
        throw new Error(
          'Failed to fetch rescue team data.'
        );
      }

      const sosData = await sosResponse.json();
      const teamsData = await teamsResponse.json();

      setSosCalls(
        Array.isArray(sosData) ? sosData : []
      );

      setRescueTeams(
        Array.isArray(teamsData) ? teamsData : []
      );
    } catch (err) {
      console.error('Dashboard data error:', err);

      setError(
        err.message ||
          'Failed to load rescue dashboard data.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ----------------------------------------------------------
  // Initial load
  // ----------------------------------------------------------

  useEffect(() => {
    fetchDashboardData(true);
  }, []);

  // ----------------------------------------------------------
  // Auto-refresh every 5 seconds
  // ----------------------------------------------------------

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      fetchDashboardData(false);
    }, 5000);

    return () => {
      clearInterval(refreshTimer);
    };
  }, []);

  // ----------------------------------------------------------
  // Initialize MapLibre
  // ----------------------------------------------------------

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    if (mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:
        'https://tiles.openfreemap.org/styles/liberty',
      center: [78.9629, 20.5937],
      zoom: 4,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      'top-right'
    );

    return () => {
      sosMarkersRef.current.forEach((marker) =>
        marker.remove()
      );

      teamMarkersRef.current.forEach((marker) =>
        marker.remove()
      );

      sosMarkersRef.current = [];
      teamMarkersRef.current = [];

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ----------------------------------------------------------
  // Update map whenever data changes
  // ----------------------------------------------------------

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (!mapRef.current.loaded()) {
      mapRef.current.once('load', () => {
        updateMapMarkers();
      });

      return;
    }

    updateMapMarkers();
  }, [sosCalls, rescueTeams]);

  // ----------------------------------------------------------
  // Draw markers
  // ----------------------------------------------------------

  const updateMapMarkers = () => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    sosMarkersRef.current.forEach((marker) =>
      marker.remove()
    );

    teamMarkersRef.current.forEach((marker) =>
      marker.remove()
    );

    sosMarkersRef.current = [];
    teamMarkersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasMarkers = false;

    // --------------------------------------------------------
    // SOS markers
    // --------------------------------------------------------

    sosCalls.forEach((sos) => {
      const latitude = Number(
        sos.user_lat ?? sos.lat ?? sos.latitude
      );

      const longitude = Number(
        sos.user_lng ?? sos.lng ?? sos.longitude
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      const element = document.createElement('div');

      element.className =
        'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-red-600 text-sm font-bold text-white shadow-lg';

      element.innerHTML = 'SOS';

      const popup = new maplibregl.Popup({
        offset: 20,
      }).setHTML(`
        <div style="min-width:180px">
          <strong>Emergency SOS</strong>
          <br/>
          <span>Location: ${latitude.toFixed(
            5
          )}, ${longitude.toFixed(5)}</span>
          <br/>
          <span>Status: ${formatStatus(
            sos.status
          )}</span>
        </div>
      `);

      const marker = new maplibregl.Marker({
        element,
      })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);

      sosMarkersRef.current.push(marker);

      bounds.extend([longitude, latitude]);
      hasMarkers = true;
    });

    // --------------------------------------------------------
    // Rescue team markers
    // --------------------------------------------------------

    rescueTeams.forEach((team) => {
      const latitude = Number(
        team.current_lat ??
          team.lat ??
          team.latitude
      );

      const longitude = Number(
        team.current_lng ??
          team.lng ??
          team.longitude
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      const element = document.createElement('div');

      element.className =
        'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow-lg';

      element.innerHTML = 'R';

      const popup = new maplibregl.Popup({
        offset: 20,
      }).setHTML(`
        <div style="min-width:180px">
          <strong>${escapeHTML(
            team.name || 'Rescue Team'
          )}</strong>
          <br/>
          <span>Team ID: ${escapeHTML(
            String(team.team_id ?? '-')
          )}</span>
          <br/>
          <span>Status: ${formatStatus(
            team.status
          )}</span>
        </div>
      `);

      const marker = new maplibregl.Marker({
        element,
      })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);

      teamMarkersRef.current.push(marker);

      bounds.extend([longitude, latitude]);
      hasMarkers = true;
    });

    // --------------------------------------------------------
    // Fit all markers
    // --------------------------------------------------------

    if (hasMarkers) {
      map.fitBounds(bounds, {
        padding: 70,
        maxZoom: 15,
        duration: 800,
      });
    }
  };

  // ----------------------------------------------------------
  // Manual refresh
  // ----------------------------------------------------------

  const handleRefresh = () => {
    fetchDashboardData(false);
  };

  // ----------------------------------------------------------
  // Select SOS
  // ----------------------------------------------------------

  const handleSOSClick = (sos) => {
    setSelectedSOS(sos);

    const latitude = Number(
      sos.user_lat ?? sos.lat ?? sos.latitude
    );

    const longitude = Number(
      sos.user_lng ?? sos.lng ?? sos.longitude
    );

    if (
      mapRef.current &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      mapRef.current.flyTo({
        center: [longitude, latitude],
        zoom: 16,
        duration: 800,
      });
    }
  };

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-red-500" />

          <p className="mt-4 text-lg font-semibold">
            Loading Rescue Dashboard...
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Connecting to emergency operations system
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* HEADER */}

      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-xl">
                🚨
              </div>

              <div>
                <h1 className="text-xl font-bold sm:text-2xl">
                  Rescue Operations Dashboard
                </h1>

                <p className="text-xs text-gray-500 sm:text-sm">
                  Emergency response monitoring system
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-gray-500">
                System Status
              </p>

              <div className="flex items-center justify-end gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />

                <span className="text-sm font-semibold text-green-400">
                  LIVE
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={`rounded-lg border border-gray-700 px-4 py-2 text-sm font-bold transition ${
                refreshing
                  ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        {/* ERROR */}

        {error && (
          <div className="mb-5 rounded-xl border border-red-800 bg-red-950/50 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-red-300">
                  Dashboard Error
                </p>

                <p className="mt-1 text-sm text-red-400">
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* SUMMARY CARDS */}

        <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Active SOS Calls"
            value={sosCalls.length}
            icon="🚨"
            iconClass="bg-red-600"
          />

          <SummaryCard
            label="Rescue Teams"
            value={rescueTeams.length}
            icon="🚑"
            iconClass="bg-blue-600"
          />

          <SummaryCard
            label="Teams On Scene"
            value={
              rescueTeams.filter(
                (team) =>
                  String(team.status).toLowerCase() ===
                  'on_scene'
              ).length
            }
            icon="✓"
            iconClass="bg-green-600"
          />
        </section>

        {/* TABLES */}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* ACTIVE SOS */}

          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  Active SOS Incidents
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Live emergency calls requiring attention
                </p>
              </div>

              <span className="w-fit rounded-full bg-red-950 px-3 py-1 text-xs font-bold text-red-400">
                {sosCalls.length} ACTIVE
              </span>
            </div>

            <div className="overflow-x-auto">
              {sosCalls.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="text-4xl opacity-50">
                    ✓
                  </div>

                  <p className="mt-3 font-semibold text-gray-400">
                    No active SOS calls
                  </p>

                  <p className="mt-1 text-xs text-gray-600">
                    The rescue team is currently monitoring
                    the area.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-left">
                  <thead className="bg-gray-950/80 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">
                        SOS ID
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        User Location
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Zone Level
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Status
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Created Time
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-800">
                    {sosCalls.map((sos) => (
                      <SOSRow
                        key={sos.sos_id}
                        sos={sos}
                        selected={
                          selectedSOS?.sos_id ===
                          sos.sos_id
                        }
                        onClick={() =>
                          handleSOSClick(sos)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RESCUE TEAMS */}

          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  Rescue Teams Status
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Current location and deployment status
                </p>
              </div>

              <span className="w-fit rounded-full bg-blue-950 px-3 py-1 text-xs font-bold text-blue-400">
                {rescueTeams.length} TEAMS
              </span>
            </div>

            <div className="overflow-x-auto">
              {rescueTeams.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="text-4xl opacity-50">
                    🚑
                  </div>

                  <p className="mt-3 font-semibold text-gray-400">
                    No rescue teams available
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[780px] text-left">
                  <thead className="bg-gray-950/80 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">
                        Team ID
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Team Name
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Current Location
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Status
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Assigned SOS
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-800">
                    {rescueTeams.map((team) => (
                      <RescueTeamRow
                        key={team.team_id}
                        team={team}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        {/* MAP */}

        <section className="mt-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
          <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">
                Live Rescue Operations Map
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Red markers represent SOS incidents. Blue
                markers represent rescue teams.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2 text-red-400">
                <span className="h-3 w-3 rounded-full bg-red-600" />
                SOS
              </div>

              <div className="flex items-center gap-2 text-blue-400">
                <span className="h-3 w-3 rounded-full bg-blue-600" />
                Rescue Team
              </div>
            </div>
          </div>

          <div
            ref={mapContainerRef}
            className="h-[400px] w-full sm:h-[480px] lg:h-[550px]"
          />
        </section>

        {/* SELECTED SOS DETAILS */}

        {selectedSOS && (
          <section className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Selected Emergency
                </p>

                <h2 className="mt-1 text-xl font-bold text-white">
                  SOS {shortenId(selectedSOS.sos_id)}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSOS(null)}
                className="w-fit rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem
                label="Location"
                value={formatCoordinates(
                  selectedSOS.user_lat,
                  selectedSOS.user_lng
                )}
              />

              <DetailItem
                label="Zone Level"
                value={getZoneLevel(selectedSOS)}
              />

              <DetailItem
                label="Status"
                value={formatStatus(
                  selectedSOS.status
                )}
              />

              <DetailItem
                label="Created"
                value={formatDateTime(
                  selectedSOS.created_at
                )}
              />
            </div>
          </section>
        )}

        <footer className="py-6 text-center text-xs text-gray-600">
          Rescue Operations Dashboard • Data refreshes
          automatically every 5 seconds
        </footer>
      </main>
    </div>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  label,
  value,
  icon,
  iconClass,
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {label}
          </p>

          <p className="mt-2 text-3xl font-black text-white">
            {value}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SOS ROW
// ============================================================

function SOSRow({
  sos,
  selected,
  onClick,
}) {
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition ${
        selected
          ? 'bg-red-950/50'
          : 'hover:bg-gray-800/70'
      }`}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />

          <span className="font-mono text-sm font-bold text-white">
            {shortenId(sos.sos_id)}
          </span>
        </div>
      </td>

      <td className="px-5 py-4">
        <span className="font-mono text-xs text-gray-300">
          {formatCoordinates(
            sos.user_lat,
            sos.user_lng
          )}
        </span>
      </td>

      <td className="px-5 py-4">
        <ZoneBadge
          level={getZoneLevel(sos)}
        />
      </td>

      <td className="px-5 py-4">
        <StatusBadge status={sos.status} />
      </td>

      <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
        {formatDateTime(sos.created_at)}
      </td>
    </tr>
  );
}

// ============================================================
// RESCUE TEAM ROW
// ============================================================

function RescueTeamRow({ team }) {
  return (
    <tr className="transition hover:bg-gray-800/70">
      <td className="px-5 py-4">
        <span className="font-mono text-sm font-bold text-gray-200">
          #{team.team_id ?? '-'}
        </span>
      </td>

      <td className="px-5 py-4">
        <span className="text-sm font-semibold text-white">
          {team.name || 'Unnamed Team'}
        </span>
      </td>

      <td className="px-5 py-4">
        <span className="font-mono text-xs text-gray-300">
          {formatCoordinates(
            team.current_lat,
            team.current_lng
          )}
        </span>
      </td>

      <td className="px-5 py-4">
        <TeamStatusBadge status={team.status} />
      </td>

      <td className="px-5 py-4">
        {team.assigned_sos_id ? (
          <span className="rounded bg-red-950 px-2 py-1 font-mono text-xs font-bold text-red-400">
            {shortenId(team.assigned_sos_id)}
          </span>
        ) : (
          <span className="text-xs text-gray-600">
            Not assigned
          </span>
        )}
      </td>
    </tr>
  );
}

// ============================================================
// ZONE BADGE
// ============================================================

function ZoneBadge({ level }) {
  const normalized = String(level || 'low')
    .toLowerCase()
    .trim();

  const styles = {
    high: 'bg-red-950 text-red-400 border-red-800',
    medium:
      'bg-yellow-950 text-yellow-400 border-yellow-800',
    low: 'bg-blue-950 text-blue-400 border-blue-800',
  };

  const labels = {
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
  };

  const style =
    styles[normalized] ||
    'bg-gray-800 text-gray-400 border-gray-700';

  const label =
    labels[normalized] || 'UNKNOWN';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}
    >
      {label}
    </span>
  );
}

// ============================================================
// SOS STATUS BADGE
// ============================================================

function StatusBadge({ status }) {
  const normalized = String(status || '')
    .toLowerCase()
    .trim();

  const styles = {
    pending:
      'bg-yellow-950 text-yellow-400 border-yellow-800',
    active:
      'bg-red-950 text-red-400 border-red-800',
    resolved:
      'bg-green-950 text-green-400 border-green-800',
  };

  const style =
    styles[normalized] ||
    'bg-gray-800 text-gray-400 border-gray-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${style}`}
    >
      {normalized || 'UNKNOWN'}
    </span>
  );
}

// ============================================================
// TEAM STATUS BADGE
// ============================================================

function TeamStatusBadge({ status }) {
  const normalized = String(status || '')
    .toLowerCase()
    .trim();

  const styles = {
    en_route:
      'bg-blue-950 text-blue-400 border-blue-800',
    on_scene:
      'bg-green-950 text-green-400 border-green-800',
    available:
      'bg-gray-800 text-gray-400 border-gray-700',
  };

  const style =
    styles[normalized] ||
    'bg-gray-800 text-gray-400 border-gray-700';

  const labels = {
    en_route: 'EN ROUTE',
    on_scene: 'ON SCENE',
    available: 'AVAILABLE',
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}
    >
      {labels[normalized] ||
        formatStatus(normalized)}
    </span>
  );
}

// ============================================================
// DETAIL ITEM
// ============================================================

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-gray-950/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-bold text-white">
        {value}
      </p>
    </div>
  );
}

// ============================================================
// GET ZONE LEVEL
// ============================================================

function getZoneLevel(sos) {
  return (
    sos.zone_level ||
    sos.zoneLevel ||
    sos.level ||
    'LOW'
  );
}

// ============================================================
// SHORT ID
// ============================================================

function shortenId(id) {
  if (!id) {
    return '-';
  }

  const value = String(id);

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 8)}...`;
}

// ============================================================
// FORMAT COORDINATES
// ============================================================

function formatCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return 'Location unavailable';
  }

  return `${latitude.toFixed(
    5
  )}, ${longitude.toFixed(5)}`;
}

// ============================================================
// FORMAT DATE/TIME
// ============================================================

function formatDateTime(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// ============================================================
// FORMAT STATUS
// ============================================================

function formatStatus(status) {
  if (!status) {
    return 'Unknown';
  }

  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

// ============================================================
// ESCAPE HTML FOR MAP POPUPS
// ============================================================

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default RescueDashboard;