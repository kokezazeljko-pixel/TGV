// Map geometry: projection, the stylized TGV network, matching real stations to it,
// and estimating where a train is right now from its timetable and delay.
import NET from "@/lib/network.json";
import { toMin } from "@/lib/format";

export { NET };
const LON0 = -5.4, LON1 = 10.0, LAT0 = 41.2, LAT1 = 51.4, COS = Math.cos((46.5 * Math.PI) / 180);
export const W = 1000;
const K = W / ((LON1 - LON0) * COS);
export const H = Math.round((LAT1 - LAT0) * K);
export const proj = (lat, lon) => [(lon - LON0) * COS * K, (LAT1 - lat) * K];

export const nodes = {};
const byName = {};
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
for (const [k, v] of Object.entries(NET.nodes)) {
  const [x, y] = proj(v[0], v[1]);
  nodes[k] = { k, x, y, lat: v[0], lon: v[1], name: v[2] || null, lvl: v[3] || 0, short: v[4], pos: v[5], group: v[6] || null };
  if (v[2]) byName[norm(v[2])] = nodes[k];
}
export const stations = Object.values(nodes).filter((n) => n.name);

const adj = {};
for (const [, path] of NET.lines) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    (adj[a] ||= []).push([b, d]);
    (adj[b] ||= []).push([a, d]);
  }
}

// Shortest path on the network between two nodes -> list of [x, y]
const routeCache = new Map();
export function route(a, b) {
  const key = a + "|" + b;
  if (routeCache.has(key)) return routeCache.get(key);
  const dist = { [a]: 0 }, prev = {}, done = new Set(), todo = [a];
  while (todo.length) {
    todo.sort((p, q) => dist[p] - dist[q]);
    const u = todo.shift();
    if (done.has(u)) continue;
    done.add(u);
    if (u === b) break;
    for (const [v, w] of adj[u] || []) {
      const nd = dist[u] + w;
      if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; todo.push(v); }
    }
  }
  let pts;
  if (a === b) pts = [[nodes[a].x, nodes[a].y]];
  else if (prev[b] !== undefined) {
    const seq = [b];
    while (seq[0] !== a) seq.unshift(prev[seq[0]]);
    pts = seq.map((k) => [nodes[k].x, nodes[k].y]);
  } else pts = [[nodes[a].x, nodes[a].y], [nodes[b].x, nodes[b].y]];
  routeCache.set(key, pts);
  return pts;
}

// Which network station is this real stop? By coordinates (within ~12 km), else by name.
const snapCache = new Map();
export function stopNode(s) {
  const key = s.lat != null ? `${s.lat},${s.lon}` : "n:" + s.name;
  if (snapCache.has(key)) return snapCache.get(key);
  let best = null;
  if (s.lat != null) {
    let bd = 0.1; // ~10 km
    for (const n of stations) {
      const d = Math.hypot((n.lat - s.lat), (n.lon - s.lon) * COS);
      if (d < bd) { bd = d; best = n; }
    }
  } else if (s.name) best = byName[norm(s.name)] || null;
  snapCache.set(key, best);
  return best;
}

// Trains are only ever drawn along the network: a section between two stops is shown
// only when both stops are network stations. Otherwise the train is hidden on that section.
function pathBetween(a, b) {
  const na = stopNode(a), nb = stopNode(b);
  return na && nb ? route(na.k, nb.k) : null;
}

function pointAlong(pts, f) {
  if (pts.length === 1) return [pts[0][0], pts[0][1], 0];
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); total += d;
  }
  let target = f * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const r = segs[i] ? Math.min(1, target / segs[i]) : 0;
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      return [pts[i][0] + dx * r, pts[i][1] + dy * r, (Math.atan2(dy, dx) * 180) / Math.PI];
    }
    target -= segs[i];
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1], 0];
}

// Estimated position now: { xy:[x,y,heading], next } or null when not running
export function trainPos(tr, now) {
  if (tr.cancelled || !tr.stops?.length) return null;
  const st = tr.stops.filter((s) => s.time);
  if (st.length < 2) return null;
  const est = st.map((s) => toMin(s.time) + (s.delay || 0));
  for (let i = 1; i < est.length; i++) while (est[i] < est[i - 1]) est[i] += 1440; // past midnight
  let n = now;
  if (n < est[0] - 600) n += 1440;
  if (n < est[0] || n > est[est.length - 1]) return null;
  for (let i = 0; i < st.length - 1; i++) {
    if (n >= est[i] && n <= est[i + 1]) {
      const f = est[i + 1] > est[i] ? (n - est[i]) / (est[i + 1] - est[i]) : 0;
      const pts = pathBetween(st[i], st[i + 1]);
      if (!pts) return null;
      return { xy: pointAlong(pts, f), next: st[i + 1] };
    }
  }
  return null;
}

// Full drawn route of a train (for highlighting)
export function trainRoute(tr) {
  const st = tr.stops || [];
  const out = [];
  for (let i = 1; i < st.length; i++) {
    const p = pathBetween(st[i - 1], st[i]);
    if (p) out.push(p);
  }
  return out;
}

// Does this stop belong to the selected station (or station group like "Paris")?
export function stopMatches(s, sel) {
  const n = stopNode(s);
  if (!n) return false;
  return n.name === sel || n.group === sel;
}
