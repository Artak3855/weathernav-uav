import { describe, it, expect } from 'vitest';
import { windVector, groundVelocity, crabHeading, bearing } from '../src/shared/geo';
import { assess } from '../src/shared/hazard';
import { planRoute, routeHits, Circle } from '../src/shared/planner';
import { normalizeCurrent } from '../server/weather';

const th = { maxWind: 15, cautionWind: 10, humidity: 85, staleSec: 300 };
const A = { lat: 40.18, lon: 44.5 }, B = { lat: 40.3, lon: 44.7 };
const mid = { lat: 40.24, lon: 44.6 };
const storm = (r: number, c = mid): Circle => ({ ...c, radiusM: r, kind: 'storm', label: 't' });

describe('wind', () => {
  it('wind FROM west (270) blows toward east', () => { const v = windVector(10, 270); expect(v.e).toBeCloseTo(10); expect(v.n).toBeCloseTo(0); });
  it('north-bound drone in west wind drifts east', () => { expect(groundVelocity(12, 0, 5, 270).e).toBeCloseTo(5); });
  it('crab heading cancels crosswind', () => { const h = crabHeading(0, 12, 5, 270)!; expect(groundVelocity(12, h, 5, 270).e).toBeCloseTo(0, 5); });
  it('returns null when wind exceeds airspeed', () => { expect(crabHeading(0, 5, 10, 270)).toBeNull(); });
  it('bearing north is ~0', () => { expect(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0); });
});
describe('weather normalization', () => {
  it('maps fields and nulls missing', () => { const n = normalizeCurrent({ current: { time: '2026-01-01T00:00', temperature_2m: 5, wind_speed_10m: 3 } }); expect(n.temperature).toBe(5); expect(n.humidity).toBeNull(); });
  it('handles empty payload', () => { expect(normalizeCurrent({}).windSpeed).toBeNull(); });
});
describe('hazard assessment', () => {
  it('normal', () => expect(assess({ windSpeed: 3, humidity: 40, temperature: 15, ageSec: 10 }, th).level).toBe('normal'));
  it('high on strong wind', () => expect(assess({ windSpeed: 20, humidity: 40, temperature: 15, ageSec: 10 }, th).level).toBe('high'));
  it('unknown when missing', () => expect(assess({ windSpeed: null, humidity: null, temperature: null, ageSec: null }, th).level).toBe('unknown'));
  it('unknown when stale', () => expect(assess({ windSpeed: 3, humidity: 40, temperature: 15, ageSec: 9999 }, th).level).toBe('unknown'));
});
describe('route planning', () => {
  it('avoids an obstacle', () => { const hz = [storm(3500)]; const r = planRoute(A, B, hz)!; expect(r).not.toBeNull(); expect(routeHits([A, B], hz)).toBe(true); expect(routeHits(r, hz)).toBe(false); });
  it('returns null when destination is inside a hazard', () => { expect(planRoute(A, B, [storm(3000, B)])).toBeNull(); });
});
