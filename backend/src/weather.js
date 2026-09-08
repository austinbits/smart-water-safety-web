const cache = new Map();
async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Weather provider returned ${r.status}`);
  return r.json();
}
async function getWeather(site) {
  const cached = cache.get(site.id);
  if (cached && Date.now() - cached.saved < 15 * 60000) return cached.value;
  const params = new URLSearchParams({
    latitude: site.center[1],
    longitude: site.center[0],
    current:
      "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code",
    hourly:
      "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m",
    timezone: "Asia/Kolkata",
    forecast_days: "3",
  });
  const weather = await fetchJSON(
    `https://api.open-meteo.com/v1/forecast?${params}`,
  );
  let marine = null,
    marine_error = null;
  if (site.type === "beach")
    try {
      marine = await fetchJSON(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${site.center[1]}&longitude=${site.center[0]}&hourly=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&timezone=Asia%2FKolkata&forecast_days=3&cell_selection=sea`,
      );
    } catch {
      marine_error = "Marine model unavailable; no synthetic replacement used.";
    }
  const value = {
    site: site.id,
    source: "Open-Meteo numerical weather model",
    source_url: "https://open-meteo.com/en/docs",
    retrieved_at: new Date().toISOString(),
    provenance: "model_forecast",
    weather,
    marine,
    marine_error,
    limitations: [
      "Model output is not an on-site observation.",
      "Coarse ocean currents do not establish nearshore rip-current conditions.",
      "Sea level above mean sea level is not the transcribed tide chart datum.",
      "Local river stage, discharge and field-certified safety thresholds are not available.",
    ],
  };
  cache.set(site.id, { saved: Date.now(), value });
  return value;
}
module.exports = { getWeather };
