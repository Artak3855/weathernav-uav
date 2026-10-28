import { LatLon, haversine } from './geo';
export interface Circle { lat: number; lon: number; radiusM: number; kind: 'wind' | 'storm'; label: string; windSpeed?: number }

export function insideAny(p: LatLon, hz: Circle[]): Circle | undefined { return hz.find(h => haversine(p, h) <= h.radiusM); }
/** True if the polyline passes through any hazard (sampled every ~100 m). */
export function routeHits(route: LatLon[], hz: Circle[]): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const n = Math.max(1, Math.ceil(haversine(route[i], route[i + 1]) / 100));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      if (insideAny({ lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lon: route[i].lon + (route[i + 1].lon - route[i].lon) * f }, hz)) return true;
    }
  }
  return false;
}
/** A* on an N x N grid over the padded bounding box. Hazard cells are blocked. Returns null if no safe route. */
export function planRoute(start: LatLon, dest: LatLon, hz: Circle[], N = 48, pad = 0.6): LatLon[] | null {
  const span = Math.max(Math.abs(dest.lat - start.lat), Math.abs(dest.lon - start.lon), 0.02);
  const minLat = Math.min(start.lat, dest.lat) - span * pad, maxLat = Math.max(start.lat, dest.lat) + span * pad;
  const minLon = Math.min(start.lon, dest.lon) - span * pad, maxLon = Math.max(start.lon, dest.lon) + span * pad;
  const cell = (i: number, j: number): LatLon => ({ lat: minLat + ((j + 0.5) / N) * (maxLat - minLat), lon: minLon + ((i + 0.5) / N) * (maxLon - minLon) });
  const idx = (p: LatLon) => ({ i: Math.min(N - 1, Math.max(0, Math.floor(((p.lon - minLon) / (maxLon - minLon)) * N))), j: Math.min(N - 1, Math.max(0, Math.floor(((p.lat - minLat) / (maxLat - minLat)) * N))) });
  const blocked = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (insideAny(cell(i, j), hz)) blocked[j * N + i] = 1;
  const s = idx(start), g = idx(dest), sId = s.j * N + s.i, gId = g.j * N + g.i;
  if (insideAny(start, hz) || insideAny(dest, hz) || blocked[gId]) return null;
  blocked[sId] = 0;
  const gCost = new Float64Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const h = (id: number) => Math.hypot((id % N) - g.i, Math.floor(id / N) - g.j);
  const open: number[] = [sId]; gCost[sId] = 0;
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (gCost[open[k]] + h(open[k]) < gCost[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (done[cur]) continue; done[cur] = 1;
    if (cur === gId) break;
    const ci = cur % N, cj = Math.floor(cur / N);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nid = nj * N + ni; if (blocked[nid] || done[nid]) continue;
      if (di && dj && (blocked[cj * N + ni] || blocked[nj * N + ci])) continue; // no corner cutting
      const c = gCost[cur] + (di && dj ? Math.SQRT2 : 1);
      if (c < gCost[nid]) { gCost[nid] = c; prev[nid] = cur; open.push(nid); }
    }
  }
  if (prev[gId] === -1 && sId !== gId) return null;
  const path: LatLon[] = []; for (let id = gId; id !== -1; id = prev[id]) path.push(cell(id % N, Math.floor(id / N)));
  path.reverse(); path[0] = start; path[path.length - 1] = dest;
  return path.filter((_, k) => k === 0 || k === path.length - 1 || k % 2 === 0);
}
