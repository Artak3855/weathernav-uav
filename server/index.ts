import express from 'express';
import path from 'path';
import { LEVELS, normalizeCurrent, normalizeProfile, validCoords } from './weather';

const app = express();
const cache = new Map<string, { t: number; data: unknown }>();
const TTL_MS = 60_000; // Open-Meteo data updates far less often than this; avoid needless calls.

async function getJson(url: string): Promise<any> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
function handler(build: (lat: number, lon: number) => Promise<unknown>, kind: string): express.RequestHandler {
  return async (req, res) => {
    const lat = Number(req.query.latitude), lon = Number(req.query.longitude);
    if (!validCoords(lat, lon)) { res.status(400).json({ error: 'invalid_coordinates' }); return; }
    const key = `${kind}:${lat.toFixed(2)},${lon.toFixed(2)}`, hit = cache.get(key);
    if (hit && Date.now() - hit.t < TTL_MS) { res.json(hit.data); return; }
    try { const data = await build(lat, lon); cache.set(key, { t: Date.now(), data }); res.json(data); }
    catch (e) { res.status(502).json({ error: 'upstream_unavailable', message: (e as Error).message }); }
  };
}
app.get('/api/health', (_q, r) => { r.json({ status: 'ok', time: new Date().toISOString() }); });
app.get('/api/weather', handler(async (lat, lon) => normalizeCurrent(await getJson(
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=GMT`)), 'cur'));
// Pressure-level variables on the forecast endpoint. Unsupported/missing values come back as null.
app.get('/api/weather/profile', handler(async (lat, lon) => {
  const vars = LEVELS.flatMap(p => [`temperature_${p}hPa`, `wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]).join(',');
  return { source: 'open-meteo', fetchedAt: new Date().toISOString(), levels: normalizeProfile(await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${vars}&wind_speed_unit=ms&forecast_days=1&timezone=GMT`)) };
}, 'prof'));

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (_q, r) => { r.sendFile(path.join(dist, 'index.html')); });
const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log('WeatherNav server on port ' + port));
