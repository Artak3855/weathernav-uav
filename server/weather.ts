// Normalizes Open-Meteo responses. Missing variables become null (never fabricated).
export interface CurrentWeather { temperature: number | null; humidity: number | null; windSpeed: number | null; windDirection: number | null; providerTime: string | null; fetchedAt: string; source: 'open-meteo'; units: { temperature: '°C'; humidity: '%'; windSpeed: 'm/s'; windDirection: '° (from)' } }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function normalizeCurrent(raw: any, now = new Date()): CurrentWeather {
  const c = raw?.current ?? {};
  return { temperature: num(c.temperature_2m), humidity: num(c.relative_humidity_2m), windSpeed: num(c.wind_speed_10m), windDirection: num(c.wind_direction_10m),
    providerTime: typeof c.time === 'string' ? c.time + 'Z' : null, fetchedAt: now.toISOString(), source: 'open-meteo',
    units: { temperature: '°C', humidity: '%', windSpeed: 'm/s', windDirection: '° (from)' } };
}
export const LEVELS = [1000, 925, 850, 700, 500];
export function normalizeProfile(raw: any) {
  const h = raw?.hourly ?? {};
  return LEVELS.map(p => ({ pressureHPa: p, temperature: num(h[`temperature_${p}hPa`]?.[0]), windSpeed: num(h[`wind_speed_${p}hPa`]?.[0]), windDirection: num(h[`wind_direction_${p}hPa`]?.[0]), geopotentialHeightM: num(h[`geopotential_height_${p}hPa`]?.[0]) }));
}
export function validCoords(lat: number, lon: number) { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
