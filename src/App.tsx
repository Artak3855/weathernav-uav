import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Sim, STATUS_HY, ScenarioId } from './sim';
import { assess, LEVEL_HY, Thresholds } from './hazard';
import Scene3D from './Scene3D';

interface Wx { temperature: number | null; humidity: number | null; windSpeed: number | null; windDirection: number | null; providerTime: string | null; fetchedAt: string }
const f = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));

export default function App() {
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

  // Animation loop: fixed 0.1 s simulation step, independent of weather fetching.
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

  // Weather polling: separate timer. Scenario D simulates an API outage; demo mode uses labeled fixed values.
  useEffect(() => {
    const pull = async () => {
      if (demo) { setWx({ temperature: 18, humidity: 55, windSpeed: 6, windDirection: 270, providerTime: null, fetchedAt: new Date().toISOString() }); setApiErr(null); return; }
      if (scenRef.current === 'D') { setApiErr('API խափանում (սիմուլյացիա)'); return; }
      try {
        const r = await fetch(`/api/weather?latitude=${sim.start.lat}&longitude=${sim.start.lon}`); if (!r.ok) throw new Error('HTTP ' + r.status);
        setWx(await r.json()); setApiErr(null);
      } catch (e) { setApiErr((e as Error).message); sim.note('API սխալ. օգտագործվում է վերջին հաջող պատասխանը։'); }
    };
    pull(); const id = setInterval(pull, refreshSec * 1000); return () => clearInterval(id);
  }, [refreshSec, demo, scenario, sim]);

  const ageSec = wx ? (Date.now() - new Date(wx.fetchedAt).getTime()) / 1000 : null;
  const risk = assess({ windSpeed: wx?.windSpeed ?? null, humidity: wx?.humidity ?? null, temperature: wx?.temperature ?? null, ageSec }, th);
  sim.maxWind = th.maxWind;
  if (wx && wx.windSpeed !== null && wx.windDirection !== null && risk.level !== 'unknown') sim.wind = { speed: wx.windSpeed, from: wx.windDirection };
  if (scenario === 'D' && sim.status === 'flying') sim.hold('եղանակային տվյալները անհասանելի են։');

  // Leaflet map
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

  return (<>
    <header><b>WeatherNav UAV սիմուլյատոր</b><span className={risk.level}>● {LEVEL_HY[risk.level]} · {STATUS_HY[sim.status]}</span></header>
    <div className="grid">
      <section className="card"><h3>Եղանակ <span className="tag real">{demo ? 'ՊԱՏԿԵՐԱՅԻՆ ՏՎՅԱԼՆԵՐ (demo)' : 'իրական API՝ Open-Meteo'}</span></h3>
        <table><tbody>
          <tr><td title="Ջերմաստիճան 2 մ բարձրության վրա">Ջերմաստիճան</td><td>{f(wx?.temperature ?? null)} °C</td></tr>
          <tr><td>Հարաբերական խոնավություն</td><td>{f(wx?.humidity ?? null, 0)} %</td></tr>
          <tr><td title="10 մ բարձրության վրա">Քամու արագություն</td><td>{f(wx?.windSpeed ?? null)} մ/վ</td></tr>
          <tr><td title="Այն կողմը, որտեղից է փչում քամին">Քամու ուղղություն (որտեղից)</td><td>{f(wx?.windDirection ?? null, 0)}°</td></tr>
          <tr><td>Դիտարկման/կանխատեսման ժամ</td><td>{wx?.providerTime ?? '—'}</td></tr>
          <tr><td>Վերջին հաջող ստացում</td><td>{wx ? new Date(wx.fetchedAt).toLocaleTimeString('hy-AM') : '—'} {ageSec !== null && ageSec > th.staleSec && <b className="high">(հնացած)</b>}</td></tr>
        </tbody></table>
        {apiErr && <p className="high">⚠ {apiErr}</p>}
        <label>Թարմացում (վ)<input value={refreshSec} onChange={e => setRefreshSec(Math.max(15, num(e.target.value, 60)))} /></label>
        <button className="alt" onClick={() => setDemo(!demo)}>{demo ? 'Անջատել demo' : 'Demo ռեժիմ'}</button>
      </section>
      <section className="card"><h3>Ռիսկի գնահատում <span className="tag">ստացված դասակարգում</span></h3>
        <b className={risk.level}>{LEVEL_HY[risk.level]}</b><ul>{risk.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <label>Քամու սահման (մ/վ)<input value={th.maxWind} onChange={e => setTh({ ...th, maxWind: num(e.target.value, 15) })} /></label>
        <label>Զգուշացում (մ/վ)<input value={th.cautionWind} onChange={e => setTh({ ...th, cautionWind: num(e.target.value, 10) })} /></label>
        <label>Խոնավություն (%)<input value={th.humidity} onChange={e => setTh({ ...th, humidity: num(e.target.value, 85) })} /></label>
        <p className="note">Ջերմաստիճանն ու խոնավությունը միայն չեն հաստատում կարկուտը. արդյունքը «նպաստավոր պայմանների» ցուցիչ է։</p>
      </section>
      <section className="card"><h3>Հեռաչափություն <span className="tag sim">սիմուլյացիա</span></h3>
        <table><tbody>
          <tr><td>Դիրք</td><td>{sim.pos.lat.toFixed(4)}, {sim.pos.lon.toFixed(4)}</td></tr>
          <tr><td>Բարձրություն</td><td>{sim.alt} մ</td></tr><tr><td>Արագություն (գետնի)</td><td>{sim.gs.toFixed(1)} մ/վ</td></tr>
          <tr><td>Ուղղություն</td><td>{sim.heading.toFixed(0)}°</td></tr><tr><td>Մարտկոց</td><td>{sim.battery.toFixed(1)} %</td></tr>
          <tr><td>Անցած ճանապարհ</td><td>{(sim.dist / 1000).toFixed(2)} կմ</td></tr><tr><td>Ժամանակ</td><td>{Math.round(sim.elapsed)} վ</td></tr>
          <tr><td>Կարգավիճակ</td><td>{STATUS_HY[sim.status]}</td></tr>
        </tbody></table>
        <label>Օդային արագություն<input value={sim.airspeed} onChange={e => { sim.airspeed = Math.max(1, num(e.target.value, 12)); }} /></label>
        <label>Մարտկոցի պահուստ %<input value={sim.reserve} onChange={e => { sim.reserve = num(e.target.value, 20); }} /></label>
        <label>Ժամանակի արագացում ×<input value={scale} onChange={e => setScale(Math.max(1, num(e.target.value, 20)))} /></label>
      </section>
      <section className="card"><h3>Կառավարում և սցենարներ</h3>
        <button onClick={() => sim.begin()}>Մեկնարկ / Շարունակել</button><button className="alt" onClick={() => sim.pause()}>Դադար</button>
        <button className="alt" onClick={() => { sim.reset(); setScenario('A'); }}>Վերակայել</button><button className="danger" onClick={() => sim.emergencyStop()}>Վթարային կանգ</button>
        <div>{(['A', 'B', 'C', 'D'] as ScenarioId[]).map(id => <button key={id} className={scenario === id ? '' : 'alt'} onClick={() => pickScenario(id)}>
          {{ A: 'Ա. Նորմալ եղանակ', B: 'Բ. Ուժեղ քամի', C: 'Գ. Ամպրոպ/կարկուտ (սիմուլ.)', D: 'Դ. API խափանում' }[id]}</button>)}</div>
        <p className="note">Քարտեզի վրա սեղմելը նոր նպատակակետ է դնում։ Սցենարի կրկին ընտրությունը վերակայում է այն։</p>
      </section>
      <section className="card"><h3>Քարտեզ <span className="tag sim">երթուղի՝ սիմուլյացիա</span></h3><div className="map" ref={mapEl} />
        <p className="note">Մոխրագույն՝ սկզբնական երթուղի, կանաչ՝ վերահաշվարկված, կարմիր/նարնջագույն՝ վտանգավոր գոտի։</p></section>
      <section className="card"><h3>3D տեսարան <span className="tag sim">սիմուլյացիա</span></h3><Scene3D sim={sim} /></section>
      <section className="card"><h3>Իրադարձությունների մատյան</h3><div className="log">{sim.log.map((l, i) => <div key={i}>{l.t} — {l.msg}</div>)}</div></section>
    </div>
    <p className="note" style={{ padding: '0 16px 16px' }}>Սա կրթական սիմուլյատոր է և չի երաշխավորում իրական թռիչքի անվտանգություն։ Եղանակային տվյալները իրական API-ից են, իսկ դրոնի հեռաչափությունը և վտանգավոր գոտիները՝ սիմուլյացված։</p>
  </>);
}
