// frontend/src/App.jsx

import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';

import {
  AlertTriangle,
  MapPin,
  Cloud,
  Users,
  Waves,
  Activity,
} from 'lucide-react';

import ExplorePage from './pages/ExplorePage';
import ForecastPage from './pages/ForecastPage';
import EmergencyPage from './pages/EmergencyPage';
import RescueDashboard from './pages/RescueDashboard';


/*
|--------------------------------------------------------------------------
| Navigation Items
|--------------------------------------------------------------------------
*/

const navItems = [
  {
    label: 'Explore',
    path: '/explore',
    icon: MapPin,
  },
  {
    label: 'Forecast',
    path: '/forecast',
    icon: Cloud,
  },
  {
    label: 'Emergency',
    path: '/emergency',
    icon: AlertTriangle,
  },
  {
    label: 'Rescue',
    path: '/dashboard',
    icon: Users,
  },
];


/*
|--------------------------------------------------------------------------
| Main App
|--------------------------------------------------------------------------
*/

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}


/*
|--------------------------------------------------------------------------
| Application Layout
|--------------------------------------------------------------------------
*/

function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-100">

      {/* Header */}
      <Header />

      {/* Desktop + Main Content */}
      <div className="flex min-h-0 flex-1">

        {/* Desktop Sidebar */}
        <DesktopSidebar />

        {/* Page Content */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-20 lg:pb-0">
          <Routes>

            {/* Default */}
            <Route
              path="/"
              element={
                <Navigate
                  to="/explore"
                  replace
                />
              }
            />

            {/* Explore */}
            <Route
              path="/explore"
              element={<ExplorePage />}
            />

            {/* Forecast */}
            <Route
              path="/forecast"
              element={<ForecastPage />}
            />

            {/* Emergency */}
            <Route
              path="/emergency"
              element={<EmergencyPage />}
            />

            {/* Rescue Dashboard */}
            <Route
              path="/dashboard"
              element={<RescueDashboard />}
            />

            {/* Invalid Route */}
            <Route
              path="*"
              element={
                <Navigate
                  to="/explore"
                  replace
                />
              }
            />

          </Routes>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavigation />

    </div>
  );
}


/*
|--------------------------------------------------------------------------
| Header
|--------------------------------------------------------------------------
*/

function Header() {
  return (
    <header
      className="
        sticky
        top-0
        z-50
        h-16
        border-b
        border-slate-700
        bg-slate-900
        text-white
        shadow-lg
      "
    >
      <div
        className="
          flex
          h-full
          items-center
          justify-between
          px-4
          sm:px-6
          lg:px-8
        "
      >

        {/* Logo and Title */}
        <Link
          to="/explore"
          className="
            flex
            items-center
            gap-3
            transition
            hover:opacity-90
          "
        >

          {/* Logo */}
          <div
            className="
              flex
              h-10
              w-10
              items-center
              justify-center
              rounded-xl
              bg-blue-600
              shadow-lg
              shadow-blue-900/30
            "
          >
            <Waves
              size={24}
              strokeWidth={2.5}
            />
          </div>

          {/* Title */}
          <div>
            <h1
              className="
                text-lg
                font-bold
                leading-tight
                sm:text-xl
              "
            >
              Smart Water Safety
            </h1>

            <p
              className="
                hidden
                text-xs
                text-slate-400
                sm:block
              "
            >
              Intelligent Water Rescue System
            </p>
          </div>

        </Link>


        {/* System Status */}
        <div
          className="
            hidden
            items-center
            gap-2
            rounded-full
            border
            border-slate-700
            bg-slate-800
            px-4
            py-2
            lg:flex
          "
        >
          <span
            className="
              h-2
              w-2
              animate-pulse
              rounded-full
              bg-green-400
            "
          />

          <span
            className="
              text-xs
              font-semibold
              text-slate-300
            "
          >
            SYSTEM ONLINE
          </span>
        </div>

      </div>
    </header>
  );
}


/*
|--------------------------------------------------------------------------
| Desktop Sidebar
|--------------------------------------------------------------------------
*/

function DesktopSidebar() {
  return (
    <aside
      className="
        hidden
        w-64
        shrink-0
        border-r
        border-slate-800
        bg-slate-900
        text-white
        lg:block
      "
    >

      <div
        className="
          sticky
          top-16
          flex
          h-[calc(100vh-4rem)]
          flex-col
          justify-between
          p-4
        "
      >

        {/* Navigation */}
        <nav>

          <p
            className="
              mb-4
              px-3
              text-xs
              font-bold
              uppercase
              tracking-wider
              text-slate-500
            "
          >
            Navigation
          </p>

          <div className="space-y-2">

            {navItems.map((item) => (
              <DesktopNavItem
                key={item.path}
                item={item}
              />
            ))}

          </div>

        </nav>


        {/* Sidebar Information */}
        <div
          className="
            rounded-xl
            border
            border-slate-700
            bg-slate-800/70
            p-4
          "
        >

          <div className="flex items-center gap-3">

            <div
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-lg
                bg-blue-600
              "
            >
              <Activity size={18} />
            </div>

            <div>
              <p
                className="
                  text-sm
                  font-bold
                  text-white
                "
              >
                Safety Network
              </p>

              <p
                className="
                  text-xs
                  text-slate-500
                "
              >
                Monitoring active
              </p>
            </div>

          </div>


          <div
            className="
              mt-4
              flex
              items-center
              gap-2
              text-xs
              font-medium
              text-green-400
            "
          >
            <span
              className="
                h-2
                w-2
                rounded-full
                bg-green-400
              "
            />

            All systems operational
          </div>

        </div>

      </div>

    </aside>
  );
}


/*
|--------------------------------------------------------------------------
| Desktop Navigation Item
|--------------------------------------------------------------------------
*/

function DesktopNavItem({ item }) {
  const location = useLocation();

  const Icon = item.icon;

  const isActive =
    location.pathname === item.path;

  return (
    <Link
      to={item.path}
      className={`
        group
        flex
        items-center
        gap-3
        rounded-xl
        px-4
        py-3
        text-sm
        font-semibold
        transition-all
        duration-200
        ${
          isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }
      `}
    >

      <Icon
        size={21}
        strokeWidth={isActive ? 2.5 : 2}
        className="
          shrink-0
          transition-transform
          duration-200
          group-hover:scale-105
        "
      />

      <span>
        {item.label}
      </span>

      {isActive && (
        <span
          className="
            ml-auto
            h-2
            w-2
            rounded-full
            bg-white
          "
        />
      )}

    </Link>
  );
}


/*
|--------------------------------------------------------------------------
| Mobile Bottom Navigation
|--------------------------------------------------------------------------
*/

function MobileBottomNavigation() {
  const location = useLocation();

  return (
    <nav
      className="
        fixed
        bottom-0
        left-0
        right-0
        z-50
        border-t
        border-slate-700
        bg-slate-900
        text-white
        shadow-2xl
        lg:hidden
      "
    >

      <div className="grid grid-cols-4">

        {navItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                relative
                flex
                min-h-[68px]
                flex-col
                items-center
                justify-center
                gap-1
                px-2
                py-2
                transition
                ${
                  isActive
                    ? 'bg-slate-800 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }
              `}
            >

              {/* Active Indicator */}
              {isActive && (
                <span
                  className="
                    absolute
                    left-1/2
                    top-0
                    h-1
                    w-10
                    -translate-x-1/2
                    rounded-b-full
                    bg-blue-500
                  "
                />
              )}

              <Icon
                size={21}
                strokeWidth={
                  isActive ? 2.5 : 2
                }
              />

              <span
                className="
                  text-[11px]
                  font-semibold
                "
              >
                {item.label}
              </span>

            </Link>
          );
        })}

      </div>

    </nav>
  );
}


/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

export default App;