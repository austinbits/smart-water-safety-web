import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_URL = import.meta.env.VITE_API_URL;

const DEFAULT_SITE_ID = 1;
const COUNTDOWN_START = 60;

function EmergencyPage() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const safeMarkerRef = useRef(null);
  const escalationTimeoutRef = useRef(null);

  const [isEmergency, setIsEmergency] = useState(true);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [isEscalated, setIsEscalated] = useState(false);

  const [dangerZones, setDangerZones] = useState([]);
  const [safeZones, setSafeZones] = useState([]);

  const [currentPosition, setCurrentPosition] = useState(null);
  const [destination, setDestination] = useState(null);

  const [zoneLevel, setZoneLevel] = useState('HIGH');
  const [affectedArea, setAffectedArea] = useState(
    'Emergency Area'
  );

  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------
  // Load emergency map data
  // ------------------------------------------------------------

  useEffect(() => {
    loadEmergencyData();

    return () => {
      if (escalationTimeoutRef.current) {
        clearTimeout(escalationTimeoutRef.current);
      }
    };
  }, []);

  const loadEmergencyData = async () => {
    try {
      setLoading(true);
      setError('');

      if (!API_URL) {
        throw new Error('VITE_API_URL is not configured.');
      }

      const [dangerResponse, safeResponse] = await Promise.all([
        fetch(
          `${API_URL}/api/sites/${DEFAULT_SITE_ID}/danger-zones`
        ),
        fetch(
          `${API_URL}/api/sites/${DEFAULT_SITE_ID}/safe-zones`
        ),
      ]);

      if (!dangerResponse.ok) {
        throw new Error('Failed to fetch danger zones.');
      }

      if (!safeResponse.ok) {
        throw new Error('Failed to fetch safe zones.');
      }

      const dangerData = await dangerResponse.json();
      const safeData = await safeResponse.json();

      const normalizedDangerZones = Array.isArray(dangerData)
        ? dangerData
        : [];

      const normalizedSafeZones = Array.isArray(safeData)
        ? safeData
        : [];

      setDangerZones(normalizedDangerZones);
      setSafeZones(normalizedSafeZones);

      const activeDangerZone =
        normalizedDangerZones.find(
          (zone) =>
            String(zone.zone_level).toLowerCase() === 'high'
        ) ||
        normalizedDangerZones.find(
          (zone) =>
            String(zone.zone_level).toLowerCase() === 'medium'
        ) ||
        normalizedDangerZones[0];

      if (activeDangerZone) {
        const level = String(
          activeDangerZone.zone_level || 'high'
        ).toUpperCase();

        setZoneLevel(level);

        const geometry = getDangerGeometry(activeDangerZone);

        if (geometry) {
          const center = getGeometryCenter(geometry);

          if (center) {
            setCurrentPosition(center);

            const nearest = findNearestSafeZone(
              center,
              normalizedSafeZones
            );

            if (nearest) {
              setDestination(nearest);
            }
          }
        }
      }

      const inferredArea =
        activeDangerZone?.name ||
        activeDangerZone?.zone_name ||
        `Site ${DEFAULT_SITE_ID}`;

      setAffectedArea(inferredArea);
    } catch (err) {
      console.error('Emergency data error:', err);

      setError(
        err.message || 'Failed to load emergency information.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Countdown timer
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isEmergency || isEscalated) {
      return undefined;
    }

    const timer = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          clearInterval(timer);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isEmergency, isEscalated]);

  // ------------------------------------------------------------
  // Escalation logic
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isEmergency || countdown !== 0 || isEscalated) {
      return;
    }

    setIsEscalated(true);

    escalationTimeoutRef.current = setTimeout(() => {
      resetEmergencyLocally();
    }, 5000);

    return () => {
      if (escalationTimeoutRef.current) {
        clearTimeout(escalationTimeoutRef.current);
        escalationTimeoutRef.current = null;
      }
    };
  }, [countdown, isEmergency, isEscalated]);

  // ------------------------------------------------------------
  // Map initialization
  // ------------------------------------------------------------

  useEffect(() => {
    if (
      !isEmergency ||
      loading ||
      !mapContainerRef.current ||
      !currentPosition
    ) {
      return;
    }

    if (mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: currentPosition,
      zoom: 15,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      'top-right'
    );

    map.on('load', () => {
      drawEmergencyMap(map);
    });

    return () => {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove();
        currentMarkerRef.current = null;
      }

      if (safeMarkerRef.current) {
        safeMarkerRef.current.remove();
        safeMarkerRef.current = null;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [
    isEmergency,
    loading,
    currentPosition,
    destination,
    dangerZones,
  ]);

  // ------------------------------------------------------------
  // Update existing map
  // ------------------------------------------------------------

  useEffect(() => {
    if (
      !mapRef.current ||
      !mapRef.current.loaded() ||
      !currentPosition
    ) {
      return;
    }

    drawEmergencyMap(mapRef.current);
  }, [dangerZones, currentPosition, destination]);

  // ------------------------------------------------------------
  // Map drawing
  // ------------------------------------------------------------

  const drawEmergencyMap = (map) => {
    if (!map || !currentPosition) {
      return;
    }

    const dangerFeatureCollection = {
      type: 'FeatureCollection',
      features: dangerZones
        .map((zone) => {
          const geometry = getDangerGeometry(zone);

          if (!geometry) {
            return null;
          }

          return {
            type: 'Feature',
            properties: {
              zone_id: zone.zone_id,
              zone_level: zone.zone_level,
            },
            geometry,
          };
        })
        .filter(Boolean),
    };

    if (map.getSource('emergency-danger-zones')) {
      map
        .getSource('emergency-danger-zones')
        .setData(dangerFeatureCollection);
    } else {
      map.addSource('emergency-danger-zones', {
        type: 'geojson',
        data: dangerFeatureCollection,
      });

      map.addLayer({
        id: 'emergency-danger-fill',
        type: 'fill',
        source: 'emergency-danger-zones',
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.4,
        },
      });

      map.addLayer({
        id: 'emergency-danger-outline',
        type: 'line',
        source: 'emergency-danger-zones',
        paint: {
          'line-color': '#991b1b',
          'line-width': 4,
        },
      });
    }

    if (destination) {
      const evacuationRoute = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            currentPosition,
            [
              Number(destination.lng),
              Number(destination.lat),
            ],
          ],
        },
      };

      if (map.getSource('evacuation-route')) {
        map
          .getSource('evacuation-route')
          .setData(evacuationRoute);
      } else {
        map.addSource('evacuation-route', {
          type: 'geojson',
          data: evacuationRoute,
        });

        map.addLayer({
          id: 'evacuation-route-line',
          type: 'line',
          source: 'evacuation-route',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#22c55e',
            'line-width': 6,
            'line-opacity': 0.95,
          },
        });
      }
    }

    addCurrentPositionMarker(map);
    addSafeZoneMarker(map);

    fitEmergencyMap(map);
  };

  // ------------------------------------------------------------
  // Current position marker
  // ------------------------------------------------------------

  const addCurrentPositionMarker = (map) => {
    if (!currentPosition) {
      return;
    }

    if (currentMarkerRef.current) {
      currentMarkerRef.current.remove();
    }

    const markerElement = document.createElement('div');

    markerElement.style.width = '24px';
    markerElement.style.height = '24px';
    markerElement.style.borderRadius = '9999px';
    markerElement.style.backgroundColor = '#dc2626';
    markerElement.style.border = '4px solid white';
    markerElement.style.boxShadow =
      '0 0 0 4px rgba(220,38,38,0.35)';

    currentMarkerRef.current = new maplibregl.Marker({
      element: markerElement,
    })
      .setLngLat(currentPosition)
      .setPopup(
        new maplibregl.Popup({
          offset: 20,
        }).setHTML(
          '<strong>Current Position</strong><br/>Move toward the green safe zone.'
        )
      )
      .addTo(map);
  };

  // ------------------------------------------------------------
  // Safe zone marker
  // ------------------------------------------------------------

  const addSafeZoneMarker = (map) => {
    if (!destination) {
      return;
    }

    if (safeMarkerRef.current) {
      safeMarkerRef.current.remove();
    }

    const markerElement = document.createElement('div');

    markerElement.style.width = '26px';
    markerElement.style.height = '26px';
    markerElement.style.borderRadius = '9999px';
    markerElement.style.backgroundColor = '#22c55e';
    markerElement.style.border = '4px solid white';
    markerElement.style.boxShadow =
      '0 0 0 4px rgba(34,197,94,0.3)';

    safeMarkerRef.current = new maplibregl.Marker({
      element: markerElement,
    })
      .setLngLat([
        Number(destination.lng),
        Number(destination.lat),
      ])
      .setPopup(
        new maplibregl.Popup({
          offset: 20,
        }).setHTML(
          `<strong>SAFE ZONE</strong><br/>${destination.name || 'Evacuation Point'}`
        )
      )
      .addTo(map);
  };

  // ------------------------------------------------------------
  // Fit map around emergency route
  // ------------------------------------------------------------

  const fitEmergencyMap = (map) => {
    if (!currentPosition) {
      return;
    }

    if (!destination) {
      map.flyTo({
        center: currentPosition,
        zoom: 15,
      });

      return;
    }

    const destinationCoordinates = [
      Number(destination.lng),
      Number(destination.lat),
    ];

    const bounds = new maplibregl.LngLatBounds();

    bounds.extend(currentPosition);
    bounds.extend(destinationCoordinates);

    dangerZones.forEach((zone) => {
      const geometry = getDangerGeometry(zone);

      if (!geometry) {
        return;
      }

      addGeometryToBounds(geometry, bounds);
    });

    map.fitBounds(bounds, {
      padding: 60,
      maxZoom: 16,
      duration: 700,
    });
  };

  // ------------------------------------------------------------
  // Cancel emergency
  // ------------------------------------------------------------

  const handleCancelEmergency = async () => {
    try {
      setCanceling(true);
      setError('');

      if (!API_URL) {
        throw new Error('VITE_API_URL is not configured.');
      }

      const response = await fetch(
        `${API_URL}/api/reset-demo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        let message = 'Failed to reset emergency demo.';

        try {
          const data = await response.json();

          if (data?.error) {
            message = data.error;
          }
        } catch {
          // Keep default message.
        }

        throw new Error(message);
      }

      await response.json();

      resetEmergencyLocally();
    } catch (err) {
      console.error('Emergency reset error:', err);

      setError(
        err.message || 'Failed to cancel emergency.'
      );
    } finally {
      setCanceling(false);
    }
  };

  // ------------------------------------------------------------
  // Local reset
  // ------------------------------------------------------------

  const resetEmergencyLocally = () => {
    if (escalationTimeoutRef.current) {
      clearTimeout(escalationTimeoutRef.current);
      escalationTimeoutRef.current = null;
    }

    setCountdown(COUNTDOWN_START);
    setIsEscalated(false);
    setIsEmergency(false);

    if (currentMarkerRef.current) {
      currentMarkerRef.current.remove();
      currentMarkerRef.current = null;
    }

    if (safeMarkerRef.current) {
      safeMarkerRef.current.remove();
      safeMarkerRef.current = null;
    }

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  };

  // ------------------------------------------------------------
  // Normal screen
  // ------------------------------------------------------------

  if (!isEmergency) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-5">
        <div className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-6xl">
            ✅
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Emergency Cleared
          </h1>

          <p className="mt-3 text-sm text-gray-600">
            The emergency alert has been reset. Continue
            monitoring current water safety conditions.
          </p>

          <button
            type="button"
            onClick={() => {
              setCountdown(COUNTDOWN_START);
              setIsEscalated(false);
              setIsEmergency(true);
              loadEmergencyData();
            }}
            className="mt-6 rounded-xl bg-red-700 px-6 py-3 text-base font-bold text-white transition hover:bg-red-800"
          >
            Trigger Emergency Demo
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Emergency screen
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen w-full bg-[#7f1d1d] text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <section className="flex flex-col items-center text-center">
          <div
            className="animate-pulse text-7xl sm:text-8xl"
            aria-hidden="true"
          >
            ⚠️
          </div>

          <h1 className="mt-3 text-3xl font-black tracking-wide sm:text-4xl md:text-5xl">
            {isEscalated
              ? 'SOS ESCALATED - RESCUE EN ROUTE'
              : 'DANGER - EVACUATE NOW'}
          </h1>

          <div className="mt-5">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-200">
              Current Zone Level
            </p>

            <p className="mt-1 text-6xl font-black sm:text-7xl md:text-8xl">
              {zoneLevel}
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-red-950/50 px-6 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-200">
              Affected Area
            </p>

            <p className="mt-1 text-xl font-bold">
              {affectedArea}
            </p>
          </div>

          {!isEscalated ? (
            <div className="mt-5">
              <p className="mb-2 text-sm font-bold uppercase tracking-wider">
                SOS escalation in
              </p>

              <div className="min-w-[150px] rounded-2xl border-4 border-white bg-red-600 px-8 py-4 shadow-2xl">
                <p className="text-6xl font-black">
                  {countdown}
                </p>

                <p className="text-xs font-bold uppercase">
                  seconds
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border-2 border-white bg-red-600 px-6 py-4">
              <p className="text-xl font-black">
                RESCUE TEAM DISPATCHED
              </p>

              <p className="mt-1 text-sm font-medium">
                Remain visible and follow the evacuation route.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-5 w-full max-w-2xl rounded-xl border border-red-300 bg-white px-5 py-3 text-left text-red-800">
              <p className="font-bold">
                Emergency System Error
              </p>

              <p className="mt-1 text-sm">
                {error}
              </p>
            </div>
          )}
        </section>

        <section className="mt-7 flex-1 rounded-2xl bg-white p-3 text-gray-900 shadow-2xl sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Emergency Evacuation Map
              </h2>

              <p className="text-sm text-gray-500">
                Follow the green route away from the danger
                zone.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-600" />
                Current Position
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                Safe Zone
              </div>

              <div className="flex items-center gap-2">
                <span className="h-1 w-7 rounded bg-green-500" />
                Evacuation Route
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex h-[300px] items-center justify-center rounded-xl bg-gray-100 sm:h-[360px]">
              <p className="text-lg font-bold text-gray-600">
                Loading emergency map...
              </p>
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              className="h-[300px] w-full overflow-hidden rounded-xl sm:h-[360px] md:h-[400px]"
            />
          )}

          {destination && (
            <div className="mt-3 rounded-xl bg-green-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                Nearest Safe Zone
              </p>

              <p className="mt-1 text-lg font-bold text-green-900">
                {destination.name || 'Safe Evacuation Zone'}
              </p>

              {destination.capacity != null && (
                <p className="mt-1 text-sm text-green-700">
                  Capacity: {destination.capacity}
                  {destination.current_occupancy != null
                    ? ` • Current occupancy: ${destination.current_occupancy}`
                    : ''}
                </p>
              )}
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={handleCancelEmergency}
          disabled={canceling}
          className={`mt-6 w-full rounded-2xl border-2 border-white px-6 py-4 text-xl font-black text-white shadow-xl transition ${
            canceling
              ? 'cursor-not-allowed bg-red-400'
              : 'bg-red-600 hover:bg-red-500 active:bg-red-700'
          }`}
        >
          {canceling
            ? 'Resetting Emergency...'
            : 'Cancel Emergency'}
        </button>

        <p className="mt-3 text-center text-xs text-red-200">
          Move away from the marked danger zone and proceed
          toward the nearest safe location.
        </p>
      </main>
    </div>
  );
}

// ------------------------------------------------------------
// Danger-zone GeoJSON helper
// ------------------------------------------------------------

function getDangerGeometry(zone) {
  if (!zone) {
    return null;
  }

  if (zone.geometry?.type) {
    return zone.geometry;
  }

  if (zone.polygon?.type) {
    return zone.polygon;
  }

  if (typeof zone.geometry === 'string') {
    try {
      return JSON.parse(zone.geometry);
    } catch {
      return null;
    }
  }

  if (typeof zone.polygon === 'string') {
    try {
      return JSON.parse(zone.polygon);
    } catch {
      return null;
    }
  }

  return null;
}

// ------------------------------------------------------------
// Find approximate center of polygon
// ------------------------------------------------------------

function getGeometryCenter(geometry) {
  if (!geometry?.coordinates) {
    return null;
  }

  let coordinates = [];

  if (geometry.type === 'Polygon') {
    coordinates = geometry.coordinates[0] || [];
  }

  if (geometry.type === 'MultiPolygon') {
    coordinates = geometry.coordinates[0]?.[0] || [];
  }

  if (coordinates.length === 0) {
    return null;
  }

  let totalLng = 0;
  let totalLat = 0;
  let validPoints = 0;

  coordinates.forEach((coordinate) => {
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);

    if (
      Number.isFinite(lng) &&
      Number.isFinite(lat)
    ) {
      totalLng += lng;
      totalLat += lat;
      validPoints += 1;
    }
  });

  if (validPoints === 0) {
    return null;
  }

  return [
    totalLng / validPoints,
    totalLat / validPoints,
  ];
}

// ------------------------------------------------------------
// Find nearest safe zone
// ------------------------------------------------------------

function findNearestSafeZone(position, safeZones) {
  if (
    !position ||
    !Array.isArray(safeZones) ||
    safeZones.length === 0
  ) {
    return null;
  }

  let nearest = null;
  let nearestDistance = Infinity;

  safeZones.forEach((zone) => {
    const lng = Number(zone.lng);
    const lat = Number(zone.lat);

    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat)
    ) {
      return;
    }

    const distance = haversineDistance(
      position[1],
      position[0],
      lat,
      lng
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        ...zone,
        distanceMeters: distance,
      };
    }
  });

  return nearest;
}

// ------------------------------------------------------------
// Haversine distance
// ------------------------------------------------------------

function haversineDistance(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;

  const latitude1 = degreesToRadians(lat1);
  const latitude2 = degreesToRadians(lat2);

  const latitudeDifference = degreesToRadians(
    lat2 - lat1
  );

  const longitudeDifference = degreesToRadians(
    lng2 - lng1
  );

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// ------------------------------------------------------------
// Extend map bounds using polygons
// ------------------------------------------------------------

function addGeometryToBounds(geometry, bounds) {
  if (!geometry?.coordinates) {
    return;
  }

  const visitCoordinates = (coordinates) => {
    if (
      Array.isArray(coordinates) &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      bounds.extend([
        coordinates[0],
        coordinates[1],
      ]);

      return;
    }

    if (Array.isArray(coordinates)) {
      coordinates.forEach(visitCoordinates);
    }
  };

  visitCoordinates(geometry.coordinates);
}

export default EmergencyPage;