// Conventions: angles in degrees, 0 = North, clockwise. Vec = {e: east m/s, n: north m/s}.
export interface LatLon { lat: number; lon: number }
export interface Vec { e: number; n: number }
const M_PER_DEG = 111195;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => ((r * 180) / Math.PI + 360) % 360;

/** Meteorological wind direction is the direction wind blows FROM. Air moves TOWARD from+180. */
export function windVector(speed: number, fromDeg: number): Vec {
  const to = rad((fromDeg + 180) % 360);
  return { e: speed * Math.sin(to), n: speed * Math.cos(to) };
}
export function headingVector(airspeed: number, headingDeg: number): Vec {
  return { e: airspeed * Math.sin(rad(headingDeg)), n: airspeed * Math.cos(rad(headingDeg)) };
}
/** Ground velocity = air velocity (commanded airspeed+heading) + wind velocity. */
export function groundVelocity(airspeed: number, headingDeg: number, windSpeed: number, windFromDeg: number): Vec {
  const a = headingVector(airspeed, headingDeg), w = windVector(windSpeed, windFromDeg);
  return { e: a.e + w.e, n: a.n + w.n };
}
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export function bearing(a: LatLon, b: LatLon): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return deg(Math.atan2(y, x));
}
/** Heading that cancels the cross-wind so the drone tracks `track`. null = wind too strong to hold the track. */
export function crabHeading(track: number, airspeed: number, windSpeed: number, windFromDeg: number): number | null {
  const w = windVector(windSpeed, windFromDeg), t = rad(track);
  const crossRight = w.e * Math.cos(t) - w.n * Math.sin(t); // wind component to the right of the track
  if (Math.abs(crossRight) >= airspeed) return null;
  const correction = (Math.asin(crossRight / airspeed) * 180) / Math.PI; // aim into the wind
  return (((track - correction) % 360) + 360) % 360;
}
export function moveBy(p: LatLon, v: Vec, dt: number): LatLon {
  return { lat: p.lat + (v.n * dt) / M_PER_DEG, lon: p.lon + (v.e * dt) / (M_PER_DEG * Math.cos(rad(p.lat))) };
}
/** East/north offset of p from origin, in km (used by the 3D scene). */
export function toLocalKm(origin: LatLon, p: LatLon): { x: number; z: number } {
  return { x: ((p.lon - origin.lon) * M_PER_DEG * Math.cos(rad(origin.lat))) / 1000, z: (-(p.lat - origin.lat) * M_PER_DEG) / 1000 };
}
