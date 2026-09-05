import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

const GAUGES = [
  {
    key: 'rainfall',
    label: 'Rainfall',
    unit: 'mm',
    max: 150,
  },
  {
    key: 'water_level',
    label: 'Water Level',
    unit: 'm',
    max: 10,
  },
  {
    key: 'flow_speed',
    label: 'Flow Speed',
    unit: 'm/s',
    max: 5,
  },
  {
    key: 'wind',
    label: 'Wind',
    unit: 'km/h',
    max: 50,
  },
];

const STATUS_STYLES = {
  safe: 'bg-green-500 text-white',
  caution: 'bg-yellow-500 text-black',
  avoid: 'bg-red-600 text-white',
};

const STATUS_LABELS = {
  safe: 'SAFE',
  caution: 'CAUTION',
  avoid: 'AVOID',
};

function ForecastPage() {
  const [sites, setSites] = useState([]);
  const [forecasts, setForecasts] = useState({});
  const [loading, setLoading] = useState(true);
  const [spiking, setSpiking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchForecastData();
  }, []);

  const fetchForecastData = async () => {
    try {
      setLoading(true);
      setError('');

      if (!API_URL) {
        throw new Error('VITE_API_URL is not configured.');
      }

      const sitesResponse = await fetch(`${API_URL}/api/sites`);

      if (!sitesResponse.ok) {
        throw new Error('Failed to fetch water sites.');
      }

      const sitesData = await sitesResponse.json();

      if (!Array.isArray(sitesData) || sitesData.length === 0) {
        throw new Error('No water safety sites were found.');
      }

      const forecastResults = await Promise.all(
        sitesData.map(async (site) => {
          const response = await fetch(
            `${API_URL}/api/sites/${site.site_id}/forecasts`
          );

          if (!response.ok) {
            throw new Error(
              `Failed to fetch forecast for ${site.name}.`
            );
          }

          const data = await response.json();

          return {
            siteId: site.site_id,
            forecast: Array.isArray(data) ? data : [],
          };
        })
      );

      const forecastMap = {};

      forecastResults.forEach((item) => {
        forecastMap[item.siteId] = item.forecast;
      });

      setSites(sitesData);
      setForecasts(forecastMap);
    } catch (err) {
      console.error('Forecast data error:', err);
      setError(err.message || 'Failed to load forecast data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateSpike = async () => {
    try {
      setSpiking(true);
      setError('');

      if (!API_URL) {
        throw new Error('VITE_API_URL is not configured.');
      }

      const response = await fetch(`${API_URL}/api/simulate-spike`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          site_id: 1,
        }),
      });

      if (!response.ok) {
        let message = 'Failed to simulate weather spike.';

        try {
          const errorData = await response.json();

          if (errorData?.error) {
            message = errorData.error;
          }
        } catch {
          // Keep the default error message.
        }

        throw new Error(message);
      }

      await response.json();

      // The spike endpoint updates danger zones, while the forecast
      // endpoint provides the status displayed by this page.
      await fetchForecastData();
    } catch (err) {
      console.error('Weather spike error:', err);
      setError(err.message || 'Failed to simulate weather spike.');
    } finally {
      setSpiking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg bg-white px-8 py-6 shadow">
          <p className="text-xl font-semibold text-gray-700">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 rounded-xl bg-white p-5 shadow sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Water Safety Forecast
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Current environmental conditions across monitored sites.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSimulateSpike}
            disabled={spiking}
            className={`rounded-lg px-5 py-3 text-sm font-bold text-white shadow transition ${
              spiking
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {spiking
              ? 'Simulating...'
              : 'Simulate Weather Spike'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Site Cards */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {sites.map((site) => {
            const siteForecasts = forecasts[site.site_id] || [];
            const latestForecast = siteForecasts[0];

            return (
              <ForecastCard
                key={site.site_id}
                site={site}
                forecast={latestForecast}
              />
            );
          })}
        </div>

        {sites.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="text-lg font-semibold text-gray-700">
              No sites available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ForecastCard({ site, forecast }) {
  const status = normalizeStatus(forecast?.status);

  return (
    <article className="rounded-xl bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
      {/* Card Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">
            {site.name}
          </h2>

          <p className="mt-1 text-sm capitalize text-gray-500">
            {site.type}
          </p>
        </div>

        <StatusBadge status={status} />
      </div>

      {/* Forecast content */}
      {forecast ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {GAUGES.map((gauge) => (
              <Gauge
                key={gauge.key}
                label={gauge.label}
                value={forecast[gauge.key]}
                max={gauge.max}
                unit={gauge.unit}
              />
            ))}
          </div>

          {/* Last Updated */}
          <div className="mt-6 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">
                Last updated
              </span>

              <span
                className="text-right text-sm font-semibold text-gray-700"
                title={formatExactTime(forecast.timestamp)}
              >
                {formatRelativeTime(forecast.timestamp)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-gray-50 p-6 text-center">
          <p className="font-semibold text-gray-600">
            No forecast data available.
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Forecast information will appear here when available.
          </p>
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }) {
  const statusClass =
    STATUS_STYLES[status] || 'bg-gray-500 text-white';

  const label =
    STATUS_LABELS[status] || 'UNKNOWN';

  return (
    <span
      className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${statusClass}`}
    >
      {label}
    </span>
  );
}

function Gauge({ label, value, max, unit }) {
  const numericValue = Number(value) || 0;

  const percentage = Math.min(
    Math.max((numericValue / max) * 100, 0),
    100
  );

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-600">
          {label}
        </span>

        <span className="text-xs text-gray-400">
          Max {max} {unit}
        </span>
      </div>

      {/* Gauge bar */}
      <div
        className="h-4 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-label={`${label} level`}
        aria-valuemin="0"
        aria-valuemax={max}
        aria-valuenow={numericValue}
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>

      {/* Current value */}
      <div className="mt-3 flex items-baseline justify-center gap-1">
        <span className="text-2xl font-bold text-gray-900">
          {formatValue(numericValue)}
        </span>

        <span className="text-sm font-medium text-gray-500">
          {unit}
        </span>
      </div>

      <div className="mt-1 text-center text-xs text-gray-400">
        {Math.round(percentage)}% of maximum
      </div>
    </div>
  );
}

function normalizeStatus(status) {
  if (!status) {
    return 'unknown';
  }

  const normalized = String(status).toLowerCase().trim();

  if (
    normalized === 'safe' ||
    normalized === 'caution' ||
    normalized === 'avoid'
  ) {
    return normalized;
  }

  return 'unknown';
}

function formatValue(value) {
  if (Number.isInteger(value)) {
    return value;
  }

  return Number(value).toFixed(2);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const now = Date.now();
  const difference = Math.max(0, now - date.getTime());

  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return formatExactTime(timestamp);
}

function formatExactTime(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
}

export default ForecastPage;