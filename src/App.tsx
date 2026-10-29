import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Sim, STATUS_HY, ScenarioId } from './sim';
import { assess, Thresholds } from './hazard';
import Scene3D from './Scene3D';

interface Wx { temperature: number | null; humidity: number | null; windSpeed: number | null; windDirection: number | null; providerTime: string | null; fetchedAt: string }
interface Snapshot { id: string; time: string; temp: number | null; humidity: number | null; windSpeed: number | null; windDir: number | null; dataUrl: string }

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
    mapDesc: "Ձախ քլիք՝ նպատակակետ, աջ քլիք՝ սկզբնակետ։ Մոխրագույն՝ սկզբնական երթուղի, կանաչ՝ վերահաշվարկված, կարմիր/նարնջագույն՝ վտանգավոր գոտի։",
    scene3D: "3D տեսարան",
    log: "Իրադարձությունների մատյան",
    snapshots: "Չափումների նկարներ (Սնափշոթներ)",
    stats: "Վիճակագրական համեմատություն",
    metricSelect: "Ընտրել չափորոշիչ՝",
    windMetric: "Քամու արագություն (մ/վ)",
    tempMetric: "Ջերմաստիճան (°C)",
    humMetric: "Խոնավություն (%)",
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
    mapDesc: "Left click: destination, Right click: start point. Gray: original, green: replanned, red/orange: hazard.",
    scene3D: "3D View",
    log: "Event Log",
    snapshots: "Measurement Snapshots",
    stats: "Statistical Comparison",
    metricSelect: "Select Metric:",
    windMetric: "Wind Speed (m/s)",
    tempMetric: "Temperature (°C)",
    humMetric: "Humidity (%)",
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

  // Editable states with text support to let users type freely
  const [refreshSec, setRefreshSec] = useState<string>("60");
  const [scale, setScale] = useState<string>("20");
  const [th, setTh] = useState<Thresholds>({ maxWind: 15, cautionWind: 10, humidity: 85, staleSec: 300 });
  
  const [maxWindInput, setMaxWindInput] = useState<string>("15");
  const [cautionInput, setCautionInput] = useState<string>("10");
  const [humidityInput, setHumidityInput] = useState<string>("85");

  const [airspeedInput, setairspeedInput] = useState<string>("12");
  const [reserveInput, setReserveInput] = useState<string>("20");

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedSnapIds, setSelectedSnapIds] = useState<string[]>([]);
  const [chartMetric, setChartMetric] = useState<'wind' | 'temp' | 'humidity'>('wind');

  const scaleRef = useRef(Number(scale) || 20); scaleRef.current = Number(scale) || 20;
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
      let currentWx: Wx;
      if (demo) {
        currentWx = { temperature: 18, humidity: 55, windSpeed: 6, windDirection: 270, providerTime: null, fetchedAt: new Date().toISOString() };
        setWx(currentWx); setApiErr(null);
      } else if (scenRef.current === 'D') {
        setApiErr(lang === 'hy' ? 'API խափանում (սիմուլյացիա)' : 'API Outage (simulation)');
        return;
      } else {
        try {
          const r = await fetch(`/api/weather?latitude=${sim.start.lat}&longitude=${sim.start.lon}`); if (!r.ok) throw new Error('HTTP ' + r.status);
          currentWx = await r.json();
          setWx(currentWx); setApiErr(null);

          if (sim.status === 'flying') {
            const rPos = await fetch(`/api/weather?latitude=${sim.pos.lat}&longitude=${sim.pos.lon}`);
            if (rPos.ok) {
              const posWx: Wx = await rPos.json();
              sim.note(lang === 'hy' 
                ? `Տեղային եղանակ (դիրք՝ ${sim.pos.lat.toFixed(2)}, ${sim.pos.lon.toFixed(2)}): Քամի՝ ${f(posWx.windSpeed)}մ/վ` 
                : `En-route weather (pos: ${sim.pos.lat.toFixed(2)}, ${sim.pos.lon.toFixed(2)}): Wind ${f(posWx.windSpeed)}m/s`);
            }
          }
        } catch (e) {
          setApiErr((e as Error).message); sim.note(lang === 'hy' ? 'API սխալ. օգտագործվում է վերջին հաջող պատասխանը։' : 'API error. Using last successful response.');
          return;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = 250; canvas.height = 140;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 13px sans-serif';
        ctx.fillText("Weather Snapshot", 12, 22);
        ctx.fillStyle = '#cbd5e1'; ctx.font = '11px sans-serif';
        ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 12, 42);
        ctx.fillText(`Temp: ${f(currentWx.temperature)} °C`, 12, 64);
        ctx.fillText(`Humidity: ${f(currentWx.humidity, 0)} %`, 12, 84);
        ctx.fillText(`Wind: ${f(currentWx.windSpeed)} m/s (${f(currentWx.windDirection, 0)}°)`, 12, 104);
        const dataUrl = canvas.toDataURL();
        const newSnap: Snapshot = {
          id: Date.now().toString(),
          time: new Date().toLocaleTimeString(),
          temp: currentWx.temperature,
          humidity: currentWx.humidity,
          windSpeed: currentWx.windSpeed,
          windDir: currentWx.windDirection,
          dataUrl
        };
        setSnapshots(prev => [...prev.slice(-9), newSnap]);
      }
    };

    const secNum = Math.max(15, Number(refreshSec) || 60);
    pull(); const id = setInterval(pull, secNum * 1000); return () => clearInterval(id);
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
    layers.current = L.layerGroup().addTo(m); 
    droneM.current = L.circleMarker([sim.pos.lat, sim.pos.lon], { radius: 7, color: '#22d3ee' }).addTo(m);
    
    m.on('click', (e: L.LeafletMouseEvent) => { 
      sim.dest = { lat: e.latlng.lat, lon: e.latlng.lng }; 
      sim.reset(); 
    });

    m.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      sim.setStart({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    mapRef.current = m; return () => { m.remove(); };
  }, [sim]);

  useEffect(() => {
    const g = layers.current!; g.clearLayers();
    const ll = (p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number];
    L.polyline(sim.original.map(ll), { color: '#94a3b8', dashArray: '6' }).addTo(g);
    if (sim.route !== sim.original) L.polyline(sim.route.map(ll), { color: '#22c55e' }).addTo(g);
    L.circleMarker(ll(sim.start), { radius: 5, color: '#fff' }).bindTooltip('Start').addTo(g); 
    L.circleMarker(ll(sim.dest), { radius: 6, color: '#f472b6' }).bindTooltip('Destination').addTo(g);
    sim.hazards.forEach(z => L.circle(ll(z), { radius: z.radiusM, color: z.kind === 'storm' ? '#ef4444' : '#f59e0b' }).bindTooltip(z.label).addTo(g));

    if (wx && wx.windSpeed !== null && wx.windDirection !== null) {
      const p = sim.pos;
      const rad = ((wx.windDirection + 180) % 360) * (Math.PI / 180);
      const endLat = p.lat + (wx.windSpeed * 0.002) * Math.cos(rad);
      const endLon = p.lon + (wx.windSpeed * 0.002) * Math.sin(rad);
      L.polyline([[p.lat, p.lon], [endLat, endLon]], { color: '#38bdf8', weight: 3 }).bindTooltip(`Wind: ${wx.windSpeed} m/s`).addTo(g);
    }
  }, [sim.version, sim, wx]);
  droneM.current?.setLatLng([sim.pos.lat, sim.pos.lon]);

  const pickScenario = (id: ScenarioId) => { setScenario(id); sim.setScenario(id); };

  const currentLevelText = dict.levels[risk.level];
  const currentStatusText = dict.statuses[sim.status];

  const toggleSnapSelect = (id: string) => {
    setSelectedSnapIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectedSnaps = snapshots.filter(s => selectedSnapIds.includes(s.id));

  const tempColors = ['#f97316', '#ea580c', '#c2410c', '#9a3412', '#fb923c', '#fdba74']; 
  const humidityColors = ['#06b6d4', '#0284c7', '#2563eb', '#1d4ed8', '#38bdf8', '#60a5fa']; 
  const windColors = ['#10b981', '#059669', '#047857', '#34d399', '#6ee7b7', '#34d399']; 

  const inputStyle = {
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    padding: '4px 8px',
    borderRadius: '4px',
    width: '75px',
    fontWeight: 'bold',
    textAlign: 'center' as const
  };

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
      {/* Weather Card */}
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
        <label>{dict.refresh}<input style={inputStyle} type="text" value={refreshSec} onChange={e => {
          setRefreshSec(e.target.value);
        }} /></label>
        <button className="alt" onClick={() => setDemo(!demo)}>{demo ? dict.disableDemo : dict.demo}</button>
      </section>

      {/* Risk Assessment Card */}
      <section className="card"><h3>{dict.risk} <span className="tag">{dict.riskSub}</span></h3>
        <b className={risk.level}>{currentLevelText}</b><ul>{risk.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <label>{dict.windLimit}<input style={inputStyle} type="text" value={maxWindInput} onChange={e => {
          setMaxWindInput(e.target.value);
          const v = Number(e.target.value);
          if (!isNaN(v)) setTh(prev => ({ ...prev, maxWind: v }));
        }} /></label>
        <label>{dict.cautionLimit}<input style={inputStyle} type="text" value={cautionInput} onChange={e => {
          setCautionInput(e.target.value);
          const v = Number(e.target.value);
          if (!isNaN(v)) setTh(prev => ({ ...prev, cautionWind: v }));
        }} /></label>
        <label>{dict.humidityLimit}<input style={inputStyle} type="text" value={humidityInput} onChange={e => {
          setHumidityInput(e.target.value);
          const v = Number(e.target.value);
          if (!isNaN(v)) setTh(prev => ({ ...prev, humidity: v }));
        }} /></label>
        <p className="note">{dict.noteTemp}</p>
      </section>

      {/* Telemetry Card */}
      <section className="card"><h3>{dict.telemetry} <span className="tag sim">{dict.simTag}</span></h3>
        <table><tbody>
          <tr><td>{dict.pos}</td><td>{sim.pos.lat.toFixed(4)}, {sim.pos.lon.toFixed(4)}</td></tr>
          <tr><td>{dict.alt}</td><td>{sim.alt} {lang === 'hy' ? 'մ' : 'm'}</td></tr><tr><td>{dict.speed}</td><td>{sim.gs.toFixed(1)} {lang === 'hy' ? 'մ/վ' : 'm/s'}</td></tr>
          <tr><td>{dict.heading}</td><td>{sim.heading.toFixed(0)}°</td></tr><tr><td>{dict.battery}</td><td>{sim.battery.toFixed(1)} %</td></tr>
          <tr><td>{dict.dist}</td><td>{(sim.dist / 1000).toFixed(2)} {lang === 'hy' ? 'կմ' : 'km'}</td></tr><tr><td>{dict.time}</td><td>{Math.round(sim.elapsed)} {lang === 'hy' ? 'վ' : 's'}</td></tr>
          <tr><td>{dict.status}</td><td>{currentStatusText}</td></tr>
        </tbody></table>
        <label>{dict.airspeed}<input style={inputStyle} type="text" value={airspeedInput} onChange={e => {
          setairspeedInput(e.target.value);
          const v = Number(e.target.value);
          if (!isNaN(v) && v > 0) sim.airspeed = v;
        }} /></label>
        <label>{dict.reserve}<input style={inputStyle} type="text" value={reserveInput} onChange={e => {
          setReserveInput(e.target.value);
          const v = Number(e.target.value);
          if (!isNaN(v)) sim.reserve = v;
        }} /></label>
        <label>{dict.timeScale}<input style={inputStyle} type="text" value={scale} onChange={e => {
          setScale(e.target.value);
        }} /></label>
      </section>

      {/* Control Card */}
      <section className="card"><h3>{dict.control}</h3>
        <button onClick={() => sim.begin()}>{dict.start}</button><button className="alt" onClick={() => sim.pause()}>{dict.pause}</button>
        <button className="alt" onClick={() => { sim.reset(); setScenario('A'); }}>{dict.reset}</button><button className="danger" onClick={() => sim.emergencyStop()}>{dict.emergency}</button>
        <div>{(['A', 'B', 'C', 'D'] as ScenarioId[]).map(id => <button key={id} className={scenario === id ? '' : 'alt'} onClick={() => pickScenario(id)}>
          {dict.scenarios[id]}</button>)}</div>
      </section>

      {/* Map Card */}
      <section className="card"><h3>{dict.map} <span className="tag sim">{dict.simTag}</span></h3><div className="map" ref={mapEl} />
        <p className="note">{dict.mapDesc}</p></section>

      {/* 3D View Card */}
      <section className="card"><h3>{dict.scene3D} <span className="tag sim">{dict.simTag}</span></h3><Scene3D sim={sim} /></section>
      
      {/* Event Log */}
      <section className="card"><h3>{dict.log}</h3><div className="log">{sim.log.map((l, i) => <div key={i}>{l.t} — {l.msg}</div>)}</div></section>
      
      {/* Snapshots Gallery Card */}
      <section className="card">
        <h3>{dict.snapshots}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {snapshots.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>Սպասվում է առաջին չափմանը...</p> :
            snapshots.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0f172a', padding: '6px', borderRadius: '4px' }}>
                <input type="checkbox" checked={selectedSnapIds.includes(s.id)} onChange={() => toggleSnapSelect(s.id)} />
                <img src={s.dataUrl} alt="snapshot" style={{ width: '90px', height: '50px', borderRadius: '4px', objectFit: 'cover' }} />
                <div style={{ fontSize: '11px' }}>
                  <b>{s.time}</b><br/>
                  Տաք՝ {f(s.temp)}°C | Քամի՝ {f(s.windSpeed)}մ/վ
                </div>
              </div>
            ))
          }
        </div>
      </section>

      {/* Statistical Comparison Chart Card */}
      <section className="card">
        <h3>{dict.stats}</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{dict.metricSelect}</span>
          <select 
            value={chartMetric} 
            onChange={e => setChartMetric(e.target.value as 'wind' | 'temp' | 'humidity')}
            style={{ background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}
          >
            <option value="wind">{dict.windMetric}</option>
            <option value="temp">{dict.tempMetric}</option>
            <option value="humidity">{dict.humMetric}</option>
          </select>
        </div>
        <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', height: '150px', display: 'flex', alignItems: 'flex-end', gap: '15px', overflowX: 'auto', border: '1px solid #334155' }}>
          {selectedSnaps.length === 0 ? <div style={{ margin: 'auto', color: '#64748b', fontSize: '12px' }}>Ընտրված չափումներ չկան</div> :
            selectedSnaps.map((s, idx) => {
              let val = 0;
              let maxVal = 25;
              let unit = '';
              let barColor = '#3b82f6';

              if (chartMetric === 'wind') {
                val = s.windSpeed ?? 0;
                maxVal = 30;
                unit = 'm/s';
                barColor = windColors[idx % windColors.length];
              } else if (chartMetric === 'temp') {
                val = s.temp ?? 0;
                maxVal = 50;
                unit = '°C';
                barColor = tempColors[idx % tempColors.length];
              } else {
                val = s.humidity ?? 0;
                maxVal = 100;
                unit = '%';
                barColor = humidityColors[idx % humidityColors.length];
              }

              const hPercent = Math.min(100, Math.max(5, (val / maxVal) * 100));

              return (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', flex: 1, minWidth: '40px' }}>
                  <span style={{ fontSize: '10px', color: barColor, marginBottom: '4px' }}>{f(val)}{unit}</span>
                  <div style={{ width: '20px', height: `${hPercent}%`, background: barColor, borderRadius: '3px 3px 0 0' }} title={`Time: ${s.time}, Value: ${val}${unit}`} />
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '4px' }}>#{idx + 1}</span>
                </div>
              );
            })
          }
        </div>
      </section>
    </div>
    <p className="note" style={{ padding: '0 16px 16px' }}>{dict.footer}</p>
  </>);
}
