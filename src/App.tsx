import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Sim, STATUS_HY, ScenarioId } from './sim';
import { assess, Thresholds } from './hazard';
import Scene3D from './Scene3D';

interface Wx { temperature: number | null; humidity: number | null; windSpeed: number | null; windDirection: number | null; providerTime: string | null; fetchedAt: string }
const f = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));

const t = {
  hy: {
    title: "WeatherNav UAV սիմուլյատոր",
    weather: "Եղանակ",
    realApi: "իրական API՝ Open-Meteo",
    demo: "Demo ռեժիմ",
    disableDemo: "Անջատել demo",
    risk: "Ռիսկի գնահատում",
    riskSub: "ստացված դասակարգում",
    windLimit: "Քամու սահման (մ/վ)",
    cautionLimit: "Զգուշացում (մ/վ)",
    humidityLimit: "Խոնավություն (%)",
    noteTemp: "Ջերմաստիճանն ու խոնավությունը միայն չեն հաստատում կարկուտը. արդյունքը «նպաստավոր պայմանների» ցուցիչ է։",
    telemetry: "Հեռաչափություն",
    simTag: "սիմուլյացիա",
    pos: "Դիրք",
    alt: "Բարձրություն",
    speed: "Արագություն (գետնի)",
    heading: "Ուղղություն",
    battery: "Մարտկոց",
    dist: "Անցած ճանապարհ",
    time: "Ժամանակ",
    status: "Կարգավիճակ",
    airspeed: "Օդային արագություն",
    reserve: "Մարտկոցի պահուստ %",
    timeScale: "Ժամանակի արագացում ×",
    control: "Կառավարում և սցենարներ",
    start: "Մեկնարկ / Շարունակել",
    pause: "Դադար",
    reset: "Վերակայել",
    emergency: "Վթարային կանգ",
    map: "Քարտեզ",
    mapDesc: "Մոխրագույն՝ սկզբնական երթուղի, կանաչ՝ վերահաշվարկված, կարմիր/նարնջագույն՝ վտանգավոր գոտի։",
    scene3D: "3D տեսարան",
    log: "Իրադարձությունների մատյան",
    footer: "Սա կրթական սիմուլյատոր է և չի երաշխավորում իրական թռիչքի անվտանգություն։ Եղանակային տվյալները իրական API-ից են, իսկ դրոնի հեռաչափությունը և վտանգավոր գոտիները՝ սիմուլյացված։",
    refresh: "Թարմացում (վ)",
    scenarios: { A: "Ա. Նորմալ եղանակ", B: "Բ. Ուժեղ քամի", C: "Գ. Ամպրոպ/կարկուտ (սիմուլ.)", D: "Դ. API խափանում" },
    levels: { normal: 'Նորմալ', caution: 'Զգուշացում', high: 'Բարձր ռիսկ', unknown: 'Անհայտ / անբավարար տվյալներ' },
    statuses: { idle: 'Սպասում', flying: 'Թռիչքում', paused: 'Դադար', stopped: 'Վթարային կանգ', hold: 'Անվտանգ սպասում (hold)', arrived: 'Ժամանել է' }
  },
  en: {
    title: "WeatherNav UAV Simulator",
    weather: "Weather",
    realApi: "Live API: Open-Meteo",
    demo: "Demo Mode",
    disableDemo: "Disable Demo",
    risk: "Risk Assessment",
    riskSub: "computed classification",
    windLimit: "Wind Limit (m/s)",
    cautionLimit: "Caution (m/s)",
    humidityLimit: "Humidity (%)",
    noteTemp: "Temperature and humidity alone do not confirm hail; the result is a 'favorable conditions' indicator.",
    telemetry: "Telemetry",
    simTag: "simulation",
    pos: "Position",
    alt: "Altitude",
    speed: "Ground Speed",
    heading: "Heading",
    battery: "Battery",
    dist: "Distance",
    time: "Time",
    status: "Status",
    airspeed: "Airspeed",
    reserve: "Battery Reserve %",
    timeScale: "Time Acceleration ×",
    control: "Control & Scenarios",
    start: "Start / Resume",
    pause: "Pause",
    reset: "Reset",
    emergency: "Emergency Stop",
    map: "Map",
    mapDesc: "Gray: original route, green: replanned, red/orange: hazard zone.",
    scene3D: "3D View",
    log: "Event Log",
    footer: "This is an educational simulator and does not guarantee real flight safety. Weather data comes from a live API, while drone telemetry and hazard zones are simulated.",
    refresh: "Refresh (s)",
    scenarios: { A: "A. Normal Weather", B: "B. Strong Wind", C: "C. Storm/Hail (sim.)", D: "D. API Outage" },
    levels: { normal: 'Normal', caution: 'Caution', high: 'High Risk', unknown: 'Unknown / Insufficient Data' },
    statuses: { idle: 'Idle', flying: 'Flying', paused: 'Paused', stopped: 'Stopped', hold: 'Holding', arrived: 'Arrived' }
  }
};

export default function App() {
  const [lang, setLang] = useState<'hy' | 'en'>('hy');
  const dict = t[lang];

  const simRef = useRef(new Sim()); const sim = simRef.current;
  const [, force] = useState(0);
  const [wx, setWx] = useState<Wx | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>('A');
  const [demo, setDemo] = useState(false);
  const [refreshSec, setRefreshSec] = useState(60);
  const [scale, setScale] = useState(20);
  const [th, setTh] = useState<Thresholds>({ maxWind: 15, cautionWind: 10, humidity: 85, staleSec: 300 });
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const scenRef = useRef(scenario); scenRef.current = scenario;

  useEffect(() => {
    let last = performance.now(), acc = 0, lastUi = 0, raf = 0;
    const loop = (now: number) => {
      acc += Math.min((now - last) / 1000, 0.25) * scaleRef.current; last = now;
      while (acc >= 0.1) { sim.step(0.1); acc -= 0.1; }
      if (now - lastUi > 100) { lastUi = now; force(x => x + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  useEffect(() => {
    const pull = async () => {
      if (demo) { setWx({ temperature: 18, humidity: 55, windSpeed: 6, windDirection: 270, providerTime: null, fetchedAt: new Date().toISOString() }); setApiErr(null); return; }
      if (scenRef.current === 'D') { setApiErr(lang === 'hy' ? 'API խափանում (սիմուլյացիա)' : 'API Outage (simulation)'); return; }
      try {
        const r = await fetch(`/api/weather?latitude=${sim.start.lat}&longitude=${sim.start.lon}`); if (!r.ok) throw new Error('HTTP ' + r.status);
        setWx(await r.json()); setApiErr(null);
      } catch (e) { setApiErr((e as Error).message); sim.note(lang === 'hy' ? 'API սխալ. օգտագործվում է վերջին հաջող պատասխանը։' : 'API error. Using last successful response.'); }
    };
    pull(); const id = setInterval(pull, refreshSec * 1000); return () => clearInterval(id);
  }, [refreshSec, demo, scenario, sim, lang]);

  const ageSec = wx ? (Date.now() - new Date(wx.fetchedAt).getTime()) / 1000 : null;
  const risk = assess({ windSpeed: wx?.windSpeed ?? null, humidity: wx?.humidity ?? null, temperature: wx?.temperature ?? null, ageSec }, th);
  sim.maxWind = th.maxWind;
  if (wx && wx.windSpeed !== null && wx.windDirection !== null && risk.level !== 'unknown') sim.wind = { speed: wx.windSpeed, from: wx.windDirection };
  if (scenario === 'D' && sim.status === 'flying') sim.hold(lang === 'hy' ? 'եղանակային տվյալները անհասանելի են։' : 'weather data unavailable.');

  const mapEl = useRef<HTMLDivElement>(null), mapRef = useRef<L.Map | null>(null), layers = useRef<L.LayerGroup | null>(null), droneM = useRef<L.CircleMarker | null>(null);
  useEffect(() => {
    const m = L.map(mapEl.current!).setView([40.24, 44.6], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m);
    layers.current = L.layerGroup().addTo(m); droneM.current = L.circleMarker([sim.pos.lat, sim.pos.lon], { radius: 7, color: '#22d3ee' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => { sim.dest = { lat: e.latlng.lat, lon: e.latlng.lng }; sim.reset(); });
    mapRef.current = m; return () => { m.remove(); };
  }, [sim]);

  useEffect(() => {
    const g = layers.current!; g.clearLayers();
    const ll = (p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number];
    L.polyline(sim.original.map(ll), { color: '#94a3b8', dashArray: '6' }).addTo(g);
    if (sim.route !== sim.original) L.polyline(sim.route.map(ll), { color: '#22c55e' }).addTo(g);
    L.circleMarker(ll(sim.start), { radius: 5, color: '#fff' }).addTo(g); L.circleMarker(ll(sim.dest), { radius: 6, color: '#f472b6' }).addTo(g);
    sim.hazards.forEach(z => L.circle(ll(z), { radius: z.radiusM, color: z.kind === 'storm' ? '#ef4444' : '#f59e0b' }).bindTooltip(z.label).addTo(g));
  }, [sim.version, sim]);
  droneM.current?.setLatLng([sim.pos.lat, sim.pos.lon]);

  const pickScenario = (id: ScenarioId) => { setScenario(id); sim.setScenario(id); };
  const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

  const currentLevelText = dict.levels[risk.level];
  const currentStatusText = dict.statuses[sim.status];

  return (<>
    <header>
      <b>{dict.title}</b>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button className="alt" onClick={() => setLang(lang === 'hy' ? 'en' : 'hy')}>
          🌐 {lang === 'hy' ? 'English' : 'Հայերեն'}
        </button>
        <span className={risk.level}>● {currentLevelText} · {currentStatusText}</span>
      </div>
    </header>
    <div className="grid">
      <section className="card"><h3>{dict.weather} <span className="tag real">{demo ? (lang === 'hy' ? 'ՊԱՏԿԵՐԱՅԻՆ ՏՎՅԱԼՆԵՐ (demo)' : 'DEMO DATA') : dict.realApi}</span></h3>
        <table><tbody>
          <tr><td title={lang === 'hy' ? 'Ջերմաստիճան 2 մ բարձրության վրա' : 'Temperature at 2m'}>{lang === 'hy' ? 'Ջերմաստիճան' : 'Temperature'}</td><td>{f(wx?.temperature ?? null)} °C</td></tr>
          <tr><td>{lang === 'hy' ? 'Հարաբերական խոնավություն' : 'Humidity'}</td><td>{f(wx?.humidity ?? null, 0)} %</td></tr>
          <tr><td title={lang === 'hy' ? '10 մ բարձրության վրա' : 'At 10m'}>{lang === 'hy' ? 'Քամու արագություն' : 'Wind Speed'}</td><td>{f(wx?.windSpeed ?? null)} {lang === 'hy' ? 'մ/վ' : 'm/s'}</td></tr>
          <tr><td title={lang === 'hy' ? 'Այն կողմը, որտեղից է փչում քամին' : 'Wind direction'}>{lang === 'hy' ? 'Քամու ուղղություն (որտեղից)' : 'Wind Direction'}</td><td>{f(wx?.windDirection ?? null, 0)}°</td></tr>
          <tr><td>{lang === 'hy' ? 'Դիտարկման/կանխատեսման ժամ' : 'Provider Time'}</td><td>{wx?.providerTime ?? '—'}</td></tr>
          <tr><td>{lang === 'hy' ? 'Վերջին հաջող ստացում' : 'Last Fetch'}</td><td>{wx ? new Date(wx.fetchedAt).toLocaleTimeString() : '—'} {ageSec !== null && ageSec > th.staleSec && <b className="high">({lang === 'hy' ? 'հնացած' : 'stale'})</b>}</td></tr>
        </tbody></table>
        {apiErr && <p className="high">⚠ {apiErr}</p>}
        <label>{dict.refresh}<input value={refreshSec} onChange={e => setRefreshSec(Math.max(15, num(e.target.value, 60)))} /></label>
        <button className="alt" onClick={() => setDemo(!demo)}>{demo ? dict.disableDemo : dict.demo}</button>
      </section>

      <section className="card"><h3>{dict.risk} <span className="tag">{dict.riskSub}</span></h3>
        <b className={risk.level}>{currentLevelText}</b><ul>{risk.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <label>{dict.windLimit}<input value={th.maxWind} onChange={e => setTh({ ...th, maxWind: num(e.target.value, 15) })} /></label>
        <label>{dict.cautionLimit}<input value={th.cautionWind} onChange={e => setTh({ ...th, cautionWind: num(e.target.value, 10) })} /></label>
        <label>{dict.humidityLimit}<input value={th.humidity} onChange={e => setTh({ ...th, humidity: num(e.target.value, 85) })} /></label>
        <p className="note">{dict.noteTemp}</p>
      </section>

      <section className="card"><h3>{dict.telemetry} <span className="tag sim">{dict.simTag}</span></h3>
        <table><tbody>
          <tr><td>{dict.pos}</td><td>{sim.pos.lat.toFixed(4)}, {sim.pos.lon.toFixed(4)}</td></tr>
          <tr><td>{dict.alt}</td><td>{sim.alt} {lang === 'hy' ? 'մ' : 'm'}</td></tr><tr><td>{dict.speed}</td><td>{sim.gs.toFixed(1)} {lang === 'hy' ? 'մ/վ' : 'm/s'}</td></tr>
          <tr><td>{dict.heading}</td><td>{sim.heading.toFixed(0)}°</td></tr><tr><td>{dict.battery}</td><td>{sim.battery.toFixed(1)} %</td></tr>
          <tr><td>{dict.dist}</td><td>{(sim.dist / 1000).toFixed(2)} {lang === 'hy' ? 'կմ' : 'km'}</td></tr><tr><td>{dict.time}</td><td>{Math.round(sim.elapsed)} {lang === 'hy' ? 'վ' : 's'}</td></tr>
          <tr><td>{dict.status}</td><td>{currentStatusText}</td></tr>
        </tbody></table>
        <label>{dict.airspeed}<input value={sim.airspeed} onChange={e => { sim.airspeed = Math.max(1, num(e.target.value, 12)); }} /></label>
        <label>{dict.reserve}<input value={sim.reserve} onChange={e => { sim.reserve = num(e.target.value, 20); }} /></label>
        <label>{dict.timeScale}<input value={scale} onChange={e => setScale(Math.max(1, num(e.target.value, 20)))} /></label>
      </section>

      <section className="card"><h3>{dict.control}</h3>
        <button onClick={() => sim.begin()}>{dict.start}</button><button className="alt" onClick={() => sim.pause()}>{dict.pause}</button>
        <button className="alt" onClick={() => { sim.reset(); setScenario('A'); }}>{dict.reset}</button><button className="danger" onClick={() => sim.emergencyStop()}>{dict.emergency}</button>
        <div>{(['A', 'B', 'C', 'D'] as ScenarioId[]).map(id => <button key={id} className={scenario === id ? '' : 'alt'} onClick={() => pickScenario(id)}>
          {dict.scenarios[id]}</button>)}</div>
      </section>

      <section className="card"><h3>{dict.map} <span className="tag sim">{dict.simTag}</span></h3><div className="map" ref={mapEl} />
        <p className="note">{dict.mapDesc}</p></section>
      <section className="card"><h3>{dict.scene3D} <span className="tag sim">{dict.simTag}</span></h3><Scene3D sim={sim} /></section>
      <section className="card"><h3>{dict.log}</h3><div className="log">{sim.log.map((l, i) => <div key={i}>{l.t} — {l.msg}</div>)}</div></section>
    </div>
    <p className="note" style={{ padding: '0 16px 16px' }}>{dict.footer}</p>
  </>);
}
