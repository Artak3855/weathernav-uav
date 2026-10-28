import { LatLon, bearing, crabHeading, groundVelocity, haversine, moveBy } from './geo';
import { Circle, insideAny, planRoute, routeHits } from './shared/planner';
export type Status = 'idle' | 'flying' | 'paused' | 'stopped' | 'hold' | 'arrived';
export type ScenarioId = 'A' | 'B' | 'C' | 'D';
export const STATUS_HY: Record<Status, string> = { idle: 'Սպասում', flying: 'Թռիչքում', paused: 'Դադար', stopped: 'Վթարային կանգ', hold: 'Անվտանգ սպասում (hold)', arrived: 'Ժամանել է' };

/** Simulated drone. Telemetry here is SIMULATED, never measured weather. Fixed 0.1 s step keeps it deterministic. */
export class Sim {
  start: LatLon = { lat: 40.1792, lon: 44.4991 }; dest: LatLon = { lat: 40.3, lon: 44.7 };
  pos = { ...this.start }; alt = 120; heading = 0; gs = 0; battery = 100; elapsed = 0; dist = 0;
  status: Status = 'idle'; airspeed = 12; maxWind = 15; reserve = 20;
  wind = { speed: 3, from: 270 }; hazards: Circle[] = []; original: LatLon[] = []; route: LatLon[] = []; wp = 1; version = 0;
  log: { t: string; msg: string }[] = [];
  constructor() { this.reset(); }
  note(msg: string) { this.log.unshift({ t: new Date().toLocaleTimeString('hy-AM'), msg }); this.log.length = Math.min(this.log.length, 80); }
  reset() {
    this.pos = { ...this.start }; this.battery = 100; this.elapsed = 0; this.dist = 0; this.gs = 0; this.status = 'idle'; this.hazards = [];
    this.original = this.route = [this.start, this.dest]; this.wp = 1; this.version++; this.note('Սիմուլյացիան վերակայվեց։');
  }
  begin() { if (this.status === 'idle') { this.status = 'flying'; this.note('Թռիչքը սկսվեց։'); } else if (this.status === 'paused') { this.status = 'flying'; this.note('Շարունակվում է։'); } }
  pause() { if (this.status === 'flying') { this.status = 'paused'; this.note('Դադար։'); } }
  emergencyStop() { this.status = 'stopped'; this.gs = 0; this.note('ՎԹԱՐԱՅԻՆ ԿԱՆԳ՝ շարժումն անմիջապես դադարեցվեց։'); }
  hold(why: string) { if (this.status === 'flying') { this.status = 'hold'; this.gs = 0; this.note('Անվտանգ սպասում. ' + why); } }
  setScenario(id: ScenarioId) {
    this.hazards = [];
    const mid = { lat: (this.pos.lat + this.dest.lat) / 2, lon: (this.pos.lon + this.dest.lon) / 2 };
    if (id === 'B') this.hazards = [{ ...mid, radiusM: 3500, kind: 'wind', windSpeed: 22, label: 'Ուժեղ քամու գոտի (սիմուլյացիա)' }];
    if (id === 'C') this.hazards = [{ ...mid, radiusM: 3500, kind: 'storm', label: 'Ամպրոպ/կարկուտի սիմուլյացված գոտի' }];
    this.note('Սցենար ' + id + ' ակտիվացվեց։'); this.version++; this.replan();
  }
  replan() {
    const remaining = [this.pos, ...this.route.slice(this.wp)];
    if (!routeHits(remaining, this.hazards)) return;
    this.note('Երթուղու հատվածը հատում է վտանգավոր գոտի։ Վերահաշվարկ (A*)...');
    const r = planRoute(this.pos, this.dest, this.hazards);
    if (!r) { this.hold('անվտանգ երթուղի չկա։'); return; }
    this.route = r; this.wp = 1; this.version++; this.note(`Նոր երթուղի գտնվեց (${r.length} կետ)։`);
  }
  step(dt: number) {
    if (this.status !== 'flying') return;
    const target = this.route[this.wp]; if (!target) { this.status = 'arrived'; return; }
    const zone = insideAny(this.pos, this.hazards);
    const w = zone?.windSpeed !== undefined ? { speed: zone.windSpeed, from: this.wind.from } : this.wind;
    if (w.speed > this.maxWind) return this.hold(`քամին ${w.speed} մ/վ > սահման ${this.maxWind} մ/վ։`);
    if (this.battery <= this.reserve) return this.hold('մարտկոցի պահուստը սպառվեց։');
    const track = bearing(this.pos, target), hdg = crabHeading(track, this.airspeed, w.speed, w.from);
    if (hdg === null) return this.hold('քամին թույլ չի տալիս պահել երթուղին։');
    this.heading = hdg;
    const v = groundVelocity(this.airspeed, hdg, w.speed, w.from); this.gs = Math.hypot(v.e, v.n);
    this.pos = moveBy(this.pos, v, dt); this.dist += this.gs * dt; this.elapsed += dt; this.battery -= dt * 0.05;
    if (haversine(this.pos, target) <= Math.max(40, this.gs * dt * 1.5)) { this.wp++; if (this.wp >= this.route.length) { this.status = 'arrived'; this.gs = 0; this.note('Նպատակակետին հասավ։'); } }
  }
}
