import { LatLon, bearing, crabHeading, groundVelocity, haversine, moveBy } from './geo';
import { Circle, insideAny, planRoute, routeHits } from './planner';
export type Status = 'idle' | 'flying' | 'paused' | 'stopped' | 'hold' | 'arrived';
export type ScenarioId = 'A' | 'B' | 'C' | 'D';
export const STATUS_HY: Record<Status, string> = { idle: 'Սպասում', flying: 'Թռիչքում', paused: 'Դադար', stopped: 'Վթարային կանգ', hold: 'Անվտանգ սպասում (hold)', arrived: 'Ժամանել է' };

export interface Settlement {
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
}

export const SETTLEMENTS: Settlement[] = [
  { name: 'Աբովյան', lat: 40.2742, lon: 44.6247, radiusM: 4000 },
  { name: 'Աշտարակ', lat: 40.2989, lon: 44.3597, radiusM: 4000 },
  { name: 'Էջմիածին', lat: 40.1658, lon: 44.2947, radiusM: 4500 },
  { name: 'Գառնի', lat: 40.1122, lon: 44.7303, radiusM: 3000 },
  { name: 'Եղվարդ', lat: 40.3175, lon: 44.4686, radiusM: 3500 },
  { name: 'Արզնի', lat: 40.2833, lon: 44.5833, radiusM: 2500 }
];

// Մայրուղային միջանկյալ կետեր (Road Corridors)՝ ճանապարհներով երթևեկելու համար
export const ROAD_CORRIDORS: Record<string, LatLon[]> = {
  'Yerevan-Abovyan': [
    { lat: 40.1792, lon: 44.4991 }, // Երևան (սկիզբ)
    { lat: 40.2100, lon: 44.5400 }, // Հյուսիսային մուտք / Մայրուղի
    { lat: 40.2450, lon: 44.5800 }, // Արզնու խաչմերուկ
    { lat: 40.2742, lon: 44.6247 }  // Աբովյան (վերջնակետ)
  ],
  'Yerevan-Ashtarak': [
    { lat: 40.1792, lon: 44.4991 }, // Երևան
    { lat: 40.2200, lon: 44.4200 }, // Աշտարակյան խճուղի
    { lat: 40.2989, lon: 44.3597 }  // Աշտարակ
  ]
};

export class Sim {
  start: LatLon = { lat: 40.1792, lon: 44.4991 }; dest: LatLon = { lat: 40.2742, lon: 44.6247 };
  pos = { ...this.start }; alt = 120; heading = 0; gs = 0; battery = 100; elapsed = 0; dist = 0;
  status: Status = 'idle'; airspeed = 12; maxWind = 15; reserve = 20;
  wind = { speed: 3, from: 270 }; hazards: Circle[] = []; original: LatLon[] = []; route: LatLon[] = []; wp = 1; version = 0;
  log: { t: string; msg: string }[] = [];
  
  visitedSettlements: Set<string> = new Set();
  
  constructor() { this.reset(); }
  
  note(msg: string) { 
    this.log.unshift({ t: new Date().toLocaleTimeString('hy-AM'), msg }); 
    this.log.length = Math.min(this.log.length, 80); 
  }
  
  reset() {
    this.pos = { ...this.start }; this.battery = 100; this.elapsed = 0; this.dist = 0; this.gs = 0; this.status = 'idle'; this.hazards = [];
    
    // Օգտագործել մայրուղային միջանցքը (Road Corridor), եթե առկա է համապատասխան ուղղություն
    const corridor = ROAD_CORRIDORS['Yerevan-Abovyan'] || [this.start, this.dest];
    this.original = this.route = corridor; 
    this.wp = 1; 
    this.version++; 
    this.visitedSettlements.clear();
    this.note('Սիմուլյացիան վերակայվեց (մայրուղային երթուղի)։');
  }

  setStart(p: LatLon) {
    this.start = p;
    this.reset();
    this.note('Սկզբնական կետը փոխվեց։');
  }

  getCurrentWindVector() {
    const zone = insideAny(this.pos, this.hazards);
    return zone?.windSpeed !== undefined ? { speed: zone.windSpeed, from: this.wind.from } : this.wind;
  }

  begin() { 
    if (this.status === 'idle') { this.status = 'flying'; this.note('Թռիչքը մայրուղային երթուղով սկսվեց։'); } 
    else if (this.status === 'paused') { this.status = 'flying'; this.note('Շարունակվում է։'); } 
  }

  pause() { 
    if (this.status === 'flying') { this.status = 'paused'; this.note('Դադար։'); } 
  }

  emergencyStop() { 
    this.status = 'stopped'; this.gs = 0; 
    this.note('ՎԹԱՐԱՅԻՆ ԿԱՆԳ՝ շարժումն անմիջապես դադարեցվեց։'); 
  }

  hold(why: string) { 
    if (this.status === 'flying') { this.status = 'hold'; this.gs = 0; this.note('Անվտանգ սպասում. ' + why); } 
  }

  setScenario(id: ScenarioId) {
    this.hazards = [];
    const mid = { lat: (this.pos.lat + this.dest.lat) / 2, lon: (this.pos.lon + this.dest.lon) / 2 };
    if (id === 'B') this.hazards = [{ ...mid, radiusM: 3500, kind: 'wind', windSpeed: 22, label: 'Ուժեղ քամու գոտի (մայրուղու վրա)' }];
    if (id === 'C') this.hazards = [{ ...mid, radiusM: 3500, kind: 'storm', label: 'Ամպրոպ/կարկուտի գոտի (մայրուղու վրա)' }];
    this.note('Սցենար ' + id + ' ակտիվացվեց։'); this.version++; this.replan();
  }

  replan() {
    const remaining = [this.pos, ...this.route.slice(this.wp)];
    if (!routeHits(remaining, this.hazards)) return;
    this.note('Մայրուղային երթուղին հատում է վտանգավոր գոտի։ Վերահաշվարկ (A*)...');
    const r = planRoute(this.pos, this.dest, this.hazards);
    if (!r) { this.hold('անվտանգ շրջանցող ուղի չկա։'); return; }
    this.route = r; this.wp = 1; this.version++; this.note(`Նոր անվտանգ ուղի գտնվեց (${r.length} կետ)։`);
  }

  step(dt: number) {
    if (this.status !== 'flying') return;
    const target = this.route[this.wp]; if (!target) { this.status = 'arrived'; return; }
    
    const w = this.getCurrentWindVector();
    if (w.speed > this.maxWind) return this.hold(`քամին ${w.speed} մ/վ > սահման ${this.maxWind} մ/վ։`);
    if (this.battery <= this.reserve) return this.hold('մարտկոցի պահուստը սպառվեց։');
    
    const track = bearing(this.pos, target), hdg = crabHeading(track, this.airspeed, w.speed, w.from);
    if (hdg === null) return this.hold('քամին թույլ չի տալիս պահել մայրուղային երթուղին։');
    
    this.heading = hdg;
    const v = groundVelocity(this.airspeed, hdg, w.speed, w.from); this.gs = Math.hypot(v.e, v.n);
    this.pos = moveBy(this.pos, v, dt); this.dist += this.gs * dt; this.elapsed += dt; this.battery -= dt * 0.05;
    
    SETTLEMENTS.forEach(settlement => {
      const distM = haversine(this.pos, { lat: settlement.lat, lon: settlement.lon }) * 1000;
      if (distM <= settlement.radiusM && !this.visitedSettlements.has(settlement.name)) {
        this.visitedSettlements.add(settlement.name);
        this.note(`Մայրուղով անցում ${settlement.name} համայնքի տարածքով (Հեռ.` + Math.round(distM) + `մ): Գրանցվում է եղանակը։`);
      }
    });

    if (haversine(this.pos, target) <= Math.max(40, this.gs * dt * 1.5)) { 
      this.wp++; 
      if (this.wp >= this.route.length) { 
        this.status = 'arrived'; this.gs = 0; this.note('Դրոնը հաջողությամբ հասավ նպատակակետ (մայրուղային երթուղի)։'); 
      } 
    }
  }
}
