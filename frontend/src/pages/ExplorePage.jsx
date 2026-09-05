// frontend/src/pages/ExplorePage.jsx

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_URL = import.meta.env.VITE_API_URL;

function ExplorePage() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const [sites, setSites] = useState([]);
  const [siteData, setSiteData] = useState({});
  const [currentSiteId, setCurrentSiteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch all data required for the Explore page.
  useEffect(() => {
    let cancelled = false;

    const fetchSiteData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!API_URL) {
          throw new Error('VITE_API_URL is not configured.');
        }

        const sitesResponse = await fetch(`${API_URL}/api/sites`);

        if (!sitesResponse.ok) {
          throw new Error('Failed to fetch sites.');
        }

        const sitesData = await sitesResponse.json();

        if (!Array.isArray(sitesData) || sitesData.length === 0) {
          throw new Error('No water safety sites were found.');
        }

        const allSiteData = await Promise.all(
          sitesData.map(async (site) => {
            const [routesResponse, dangerResponse, safeZonesResponse] =
              await Promise.all([
                fetch(`${API_URL}/api/sites/${site.site_id}/routes`),
                fetch(`${API_URL}/api/sites/${site.site_id}/danger-zones`),
                fetch(`${API_URL}/api/sites/${site.site_id}/safe-zones`),
              ]);

            if (
              !routesResponse.ok ||
              !dangerResponse.ok ||
              !safeZonesResponse.ok
            ) {
              throw new Error(`Failed to fetch data for ${site.name}.`);
            }

            const [routes, dangerZones, safeZones] = await Promise.all([
              routesResponse.json(),
              dangerResponse.json(),
              safeZonesResponse.json(),
            ]);

            return {
              siteId: site.site_id,
              routes,
              dangerZones,
              safeZones,
            };
          })
        );

        if (cancelled) return;

        const dataBySite = {};

        allSiteData.forEach((data) => {
          dataBySite[data.siteId] = data;
        });

        setSites(sitesData);
        setSiteData(dataBySite);
        setCurrentSiteId(sitesData[0].site_id);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        console.error('Explore page data error:', err);
        setError(err.message || 'Failed to load map data.');
        setLoading(false);
      }
    };

    fetchSiteData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize MapLibre after site data has loaded.
  useEffect(() => {
    if (
      loading ||
      error ||
      !sites.length ||
      !mapContainerRef.current ||
      mapRef.current
    ) {
      return;
    }

    const firstSite = sites[0];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [firstSite.center_lng, firstSite.center_lat],
      zoom: 13,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      const firstData = siteData[firstSite.site_id];

      if (!firstData) return;

      addSiteLayers(map, firstData);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [loading, error, sites, siteData]);

  // Update map data whenever the selected site changes.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || currentSiteId === null || !siteData[currentSiteId]) {
      return;
    }

    const selectedSite = sites.find(
      (site) => site.site_id === currentSiteId
    );

    if (!selectedSite) return;

    const updateMap = () => {
      removeSiteLayers(map);
      addSiteLayers(map, siteData[currentSiteId]);

      map.flyTo({
        center: [selectedSite.center_lng, selectedSite.center_lat],
        zoom: 13,
        duration: 1000,
        essential: true,
      });
    };

    if (map.loaded()) {
      updateMap();
    } else {
      map.once('load', updateMap);
    }
  }, [currentSiteId, sites, siteData]);

  const handleSiteClick = (site) => {
    setCurrentSiteId(site.site_id);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-50">
        <div className="text-xl font-semibold text-blue-700">
          Loading map...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-50 p-6">
        <div className="rounded-lg bg-white p-6 text-center shadow-lg">
          <h2 className="mb-2 text-xl font-bold text-red-600">
            Unable to load Explore
          </h2>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  const currentSite = sites.find(
    (site) => site.site_id === currentSiteId
  );

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-gray-100">
      {/* Header */}
      <header className="z-30 flex min-h-[72px] items-center bg-blue-600 px-5 text-white shadow-md">
        <h1 className="text-xl font-bold">
          Smart Water Safety - Explore
        </h1>
      </header>

      {/* Main map area */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="z-20 flex w-[300px] flex-shrink-0 flex-col overflow-y-auto bg-white shadow-xl">
          <div className="border-b border-gray-200 p-5">
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
              Water Sites
            </p>

            {currentSite && (
              <h2 className="mt-1 text-lg font-bold text-gray-900">
                {currentSite.name}
              </h2>
            )}
          </div>

          <div className="flex-1 p-3">
            {sites.map((site) => {
              const isActive = site.site_id === currentSiteId;

              return (
                <button
                  key={site.site_id}
                  type="button"
                  onClick={() => handleSiteClick(site)}
                  className={`mb-2 w-full rounded-lg border p-4 text-left transition ${
                    isActive
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3
                        className={`font-bold ${
                          isActive
                            ? 'text-blue-700'
                            : 'text-gray-900'
                        }`}
                      >
                        {site.name}
                      </h3>

                      <p className="mt-1 text-sm capitalize text-gray-500">
                        {site.type}
                      </p>
                    </div>

                    {isActive && (
                      <span className="mt-1 rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="mt-3 text-xs text-gray-400">
                    {Number(site.center_lat).toFixed(4)},{' '}
                    {Number(site.center_lng).toFixed(4)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="border-t border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-bold text-gray-800">
              Map Legend
            </h3>

            <div className="space-y-2 text-sm">
              <LegendItem
                type="line"
                color="#22c55e"
                label="Consensus rescue route"
              />

              <LegendItem
                type="square"
                color="#dc2626"
                label="High danger"
              />

              <LegendItem
                type="square"
                color="#f59e0b"
                label="Medium danger"
              />

              <LegendItem
                type="square"
                color="#3b82f6"
                label="Low danger"
              />

              <LegendItem
                type="circle"
                color="#2563eb"
                label="Safe zone"
              />
            </div>
          </div>
        </aside>

        {/* Map */}
        <main className="relative min-w-0 flex-1">
          <div
            ref={mapContainerRef}
            className="absolute inset-0 h-full w-full"
          />

          {/* Current site overlay */}
          {currentSite && (
            <div className="absolute left-4 top-4 z-10 rounded-lg bg-white px-4 py-3 shadow-lg">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Current site
              </p>
              <p className="text-base font-bold text-gray-900">
                {currentSite.name}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Add all layers for the currently selected site.
 */
function addSiteLayers(map, data) {
  if (!data) return;

  const {
    routes,
    dangerZones,
    safeZones,
  } = data;

  // Consensus routes.
  map.addSource('consensus-routes', {
    type: 'geojson',
    data: routes || {
      type: 'FeatureCollection',
      features: [],
    },
  });

  map.addLayer({
    id: 'consensus-routes-line',
    type: 'line',
    source: 'consensus-routes',
    paint: {
      'line-color': '#22c55e',
      'line-width': 3,
      'line-opacity': 0.8,
    },
  });

  // Danger zones.
  map.addSource('danger-zones', {
    type: 'geojson',
    data: dangerZones || {
      type: 'FeatureCollection',
      features: [],
    },
  });

  map.addLayer({
    id: 'danger-zones-fill',
    type: 'fill',
    source: 'danger-zones',
    paint: {
      'fill-color': [
        'match',
        ['get', 'zone_level'],
        'high',
        '#dc2626',
        'medium',
        '#f59e0b',
        'low',
        '#3b82f6',
        '#3b82f6',
      ],
      'fill-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'danger-zones-outline',
    type: 'line',
    source: 'danger-zones',
    paint: {
      'line-color': [
        'match',
        ['get', 'zone_level'],
        'high',
        '#dc2626',
        'medium',
        '#f59e0b',
        'low',
        '#3b82f6',
        '#3b82f6',
      ],
      'line-width': 2,
      'line-opacity': 0.9,
    },
  });

  // Safe zones.
  const safeZoneFeatures = {
    type: 'FeatureCollection',
    features: (safeZones || []).map((zone) => ({
      type: 'Feature',
      properties: {
        zone_id: zone.zone_id,
        name: zone.name,
        capacity: zone.capacity,
        current_occupancy: zone.current_occupancy,
      },
      geometry: {
        type: 'Point',
        coordinates: [
          Number(zone.lng),
          Number(zone.lat),
        ],
      },
    })),
  };

  map.addSource('safe-zones', {
    type: 'geojson',
    data: safeZoneFeatures,
  });

  map.addLayer({
    id: 'safe-zones-circle',
    type: 'circle',
    source: 'safe-zones',
    paint: {
      'circle-radius': 6,
      'circle-color': '#2563eb',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  // Safe zone labels.
  map.addLayer({
    id: 'safe-zones-labels',
    type: 'symbol',
    source: 'safe-zones',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#1e3a8a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  });
}

/**
 * Remove layers and sources before displaying another site's data.
 */
function removeSiteLayers(map) {
  const layers = [
    'safe-zones-labels',
    'safe-zones-circle',
    'danger-zones-outline',
    'danger-zones-fill',
    'consensus-routes-line',
  ];

  layers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  const sources = [
    'safe-zones',
    'danger-zones',
    'consensus-routes',
  ];

  sources.forEach((sourceId) => {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  });
}

/**
 * Small legend item component.
 */
function LegendItem({ type, color, label }) {
  let indicator;

  if (type === 'line') {
    indicator = (
      <span
        className="h-[3px] w-6 rounded-full"
        style={{ backgroundColor: color }}
      />
    );
  } else if (type === 'circle') {
    indicator = (
      <span
        className="h-3 w-3 rounded-full border border-white shadow-sm"
        style={{ backgroundColor: color }}
      />
    );
  } else {
    indicator = (
      <span
        className="h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex w-6 items-center justify-center">
        {indicator}
      </span>

      <span className="text-gray-600">{label}</span>
    </div>
  );
}

export default ExplorePage;