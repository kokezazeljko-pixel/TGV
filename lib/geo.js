// Map geometry: projection, the stylized rail networks, placing real stops on it,
// and estimating where a train is right now from its timetable and delay.
import FR from "@/lib/network.json";
import CH from "@/lib/network-ch.json";
import { toMin } from "@/lib/format";

export const W = 1000;
const cache = {};
const NETWORKS = { fr: () => FR, ch: () => CH, all: () => mergeNetworks(FR, CH) };

// One map per view: getGeo("fr"), getGeo("ch") or getGeo("all") for both countries together
export function getGeo(country = "fr") {
  const key = NETWORKS[country] ? country : "fr";
  return (cache[key] ||= createGeo(NETWORKS[key](), key));
}

// Is a point [lon, lat] inside a polygon ring of [lon, lat] points?
function inside(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// France and Switzerland on one map. Swiss stations that already exist in the French network
// (Genève, Lausanne, Basel, Zürich…) become one station, French track inside Switzerland is
// replaced by the more detailed Swiss network, and every track section is drawn only once.
const CH_MAJOR = new Set(["GVA", "BE", "ZH", "LUG"]); // the only Swiss city labels shown at full-map zoom (it is crowded there)
function mergeNetworks(fr, ch) {
  const swiss = ch.land[0];
  const nodes = {}, alias = {};
  const pad = (v) => [v[0], v[1], v[2] ?? null, v[3] ?? 0, v[4] ?? null, v[5] ?? null, v[6] ?? null];
  // last value = how close (degrees) a real stop must be to count as this station: tighter in dense Switzerland
  for (const [k, v] of Object.entries(fr.nodes)) nodes[k] = [...pad(v), inside(swiss, v[1], v[0]) ? 0.035 : 0.1];
  for (const [k, v] of Object.entries(ch.nodes)) {
    if (v[2]) {
      const twin = Object.entries(fr.nodes).find(([, f]) => f[2] && Math.hypot(f[0] - v[0], f[1] - v[1]) < 0.025);
      if (twin) { alias[k] = twin[0]; if (CH_MAJOR.has(k)) nodes[twin[0]][3] = 1; continue; }
    }
    const lvl = v[3] === 1 && !CH_MAJOR.has(k) ? 2 : v[3];
    nodes["ch_" + k] = [...pad(v).slice(0, 3), lvl || 0, ...pad(v).slice(4), 0.035];
  }
  const id = (k) => alias[k] || "ch_" + k;
  const seen = new Set(), lines = [];
  const add = (type, a, b) => {
    const key = a < b ? a + "|" + b : b + "|" + a;
    if (a === b || seen.has(key)) return;
    seen.add(key); lines.push([type, [a, b]]);
  };
  for (const [type, path] of ch.lines) for (let i = 1; i < path.length; i++) add(type, id(path[i - 1]), id(path[i]));
  for (const [type, path] of fr.lines) {
    for (let i = 1; i < path.length; i++) {
      const a = fr.nodes[path[i - 1]], b = fr.nodes[path[i]];
      if (inside(swiss, a[1], a[0]) && inside(swiss, b[1], b[0])) continue; // the Swiss network covers this
      add(type, path[i - 1], path[i]);
    }
  }
  return {
    bounds: { lon0: fr.bounds.lon0, lon1: Math.max(fr.bounds.lon1, ch.bounds.lon1), lat0: fr.bounds.lat0, lat1: fr.bounds.lat1 },
    nodes, lines,
    land: [...fr.land, ...ch.land],
    water: [...(fr.water || []), ...(ch.water || [])],
    labels: fr.labels.filter(([k]) => k !== "ch"),
  };
}

function createGeo(NET, country) {
  const { lon0: LON0, lon1: LON1, lat0: LAT0, lat1: LAT1 } = NET.bounds;
  const COS = Math.cos((((LAT0 + LAT1) / 2) * Math.PI) / 180);
  const SNAP = country === "ch" ? 0.035 : 0.1; // how close (degrees) a real stop must be to count as a map station
  const K = W / ((LON1 - LON0) * COS);
  const H = Math.round((LAT1 - LAT0) * K);
  const proj = (lat, lon) => [(lon - LON0) * COS * K, (LAT1 - lat) * K];

  const nodes = {};
  const byName = {};
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const [k, v] of Object.entries(NET.nodes)) {
    const [x, y] = proj(v[0], v[1]);
    nodes[k] = { k, x, y, lat: v[0], lon: v[1], name: v[2] || null, lvl: v[3] || 0, short: v[4], pos: v[5], group: v[6] || null, snap: v[7] || SNAP };
    if (v[2]) byName[norm(v[2])] = nodes[k];
  }
  const stations = Object.values(nodes).filter((n) => n.name);

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
  function route(a, b) {
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

  // Every track section of the network, for placing stops that are not network stations
  const edges = [];
  for (const [, path] of NET.lines) for (let i = 1; i < path.length; i++) edges.push([path[i - 1], path[i]]);

  // Closest point on any track to a map point -> virtual stop on that track
  function onTrack(x, y) {
    let best = null;
    for (const [a, b] of edges) {
      const A = nodes[a], B = nodes[b];
      const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / len2));
      const px = A.x + dx * t, py = A.y + dy * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { virtual: true, a, b, t, x: px, y: py, d };
    }
    return best;
  }

  // Where is this real stop on the map network?
  // 1) a network station within ~10 km, 2) otherwise the nearest point on a track,
  // 3) without coordinates: a station with the same name. Returns null only when unknown.
  const snapCache = new Map();
  function stopNode(s) {
    const key = s.lat != null ? `${s.lat},${s.lon}` : "n:" + s.name;
    if (snapCache.has(key)) return snapCache.get(key);
    let best = null;
    if (s.lat != null) {
      let bd = Infinity;
      for (const n of stations) {
        const d = Math.hypot(n.lat - s.lat, (n.lon - s.lon) * COS);
        if (d < n.snap && d < bd) { bd = d; best = n; }
      }
      if (!best) best = onTrack(...proj(s.lat, s.lon));
    } else if (s.name) best = byName[norm(s.name)] || null;
    snapCache.set(key, best);
    return best;
  }

  const lengthOf = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

  // Ways to leave a stop onto the network graph: [graph node, path from the stop to that node]
  function exits(P) {
    if (!P.virtual) return [[P.k, [[P.x, P.y]]]];
    return [[P.a, [[P.x, P.y], [nodes[P.a].x, nodes[P.a].y]]], [P.b, [[P.x, P.y], [nodes[P.b].x, nodes[P.b].y]]]];
  }

  // Path between two stops, always along the tracks
  const pathCache = new Map();
  function pathBetween(sa, sb) {
    const P = stopNode(sa), Q = stopNode(sb);
    if (!P || !Q) return null;
    const key = `${P.k || `${P.a}>${P.b}@${P.t.toFixed(4)}`}|${Q.k || `${Q.a}>${Q.b}@${Q.t.toFixed(4)}`}`;
    if (pathCache.has(key)) return pathCache.get(key);
    let best = null;
    // both on the same track section: straight along it
    if (P.virtual && Q.virtual && ((P.a === Q.a && P.b === Q.b) || (P.a === Q.b && P.b === Q.a))) best = [[P.x, P.y], [Q.x, Q.y]];
    else {
      let bestLen = Infinity;
      for (const [ka, pa] of exits(P)) {
        for (const [kb, pb] of exits(Q)) {
          const mid = route(ka, kb);
          const pts = [...pa.slice(0, -1), ...mid, ...pb.slice(0, -1).reverse()];
          const L = lengthOf(pts);
          if (L < bestLen) { bestLen = L; best = pts; }
        }
      }
    }
    pathCache.set(key, best);
    return best;
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
  function trainPos(tr, now) {
    if (tr.cancelled || !tr.stops?.length) return null;
    const st = tr.stops.filter((s) => s.time && stopNode(s)); // a stop we cannot place is skipped, the train keeps moving
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
  function trainRoute(tr) {
    const st = (tr.stops || []).filter((s) => stopNode(s));
    const out = [];
    for (let i = 1; i < st.length; i++) {
      const p = pathBetween(st[i - 1], st[i]);
      if (p) out.push(p);
    }
    return out;
  }

  // Does this stop belong to the selected station (or station group like "Paris")?
  function stopMatches(s, sel) {
    const n = stopNode(s);
    if (!n) return s.name === sel;
    return n.name === sel || n.group === sel || s.name === sel; // a map station, a group like "Paris", or the exact stop picked from the menu
  }

  return { NET, W, H, proj, nodes, stations, route, stopNode, trainPos, trainRoute, stopMatches, country };
}
