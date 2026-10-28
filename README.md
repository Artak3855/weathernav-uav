# WeatherNav UAV Simulator

Educational simulator: real Open-Meteo weather data + a **simulated** drone, simulated hazard zones and an explainable A* route planner. UI is in Armenian.
**Not a certified flight controller; it does not guarantee real flight safety.** Weather values come from the API; drone telemetry, clouds, wind/storm zones are simulated.

## Layout
- `server/` Express API (`/api/health`, `/api/weather`, `/api/weather/profile`), cache, timeouts, normalization (`weather.ts`). Serves `dist/` in production.
- `src/shared/` pure logic: `geo.ts` (wind vectors, conventions), `hazard.ts` (rules), `planner.ts` (A*).
- `src/sim.ts` drone simulation (fixed 0.1 s step); `src/App.tsx` dashboard + Leaflet map; `src/Scene3D.tsx` Three.js scene.
- `tests/` Vitest tests (no network needed).

Conventions: angles in degrees, 0° = North, clockwise. Wind direction = direction the wind blows **FROM**; the air moves toward `from+180°`.

## Local (Windows PowerShell)
```powershell
npm install
npm run dev        # http://localhost:5173 (API on :3000)
npm test
npm run typecheck
npm run build; npm start   # production, http://localhost:3000
```

## GitHub
```powershell
git init; git add .; git commit -m "WeatherNav MVP"
git branch -M main
git remote add origin https://github.com/<you>/weathernav-uav-simulator.git
git push -u origin main
```

## Render
New → Blueprint → select the repo (uses `render.yaml`). Build: `npm install --include=dev && npm run build`, start: `npm start`, health check `/api/health`. No env vars required (see `.env.example`).

## Troubleshooting
- Blank weather: check `/api/weather?latitude=40.18&longitude=44.5`; if the API is unreachable the UI keeps the last value and marks it stale.
- Build fails on Render: make sure devDependencies are installed (the build command includes `--include=dev`).
- Profile endpoint returns nulls: some pressure-level variables may be unavailable; values are never fabricated.
