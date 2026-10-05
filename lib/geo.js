// Map geometry: projection, the stylized rail networks, placing real stops on it,
// and estimating where a train is right now from its timetable and delay.
import FR from "@/lib/network.json";
import CH from "@/lib/network-ch.json";
import BE from "@/lib/network-be.json";
import NL from "@/lib/network-nl.json";
import LU from "@/lib/network-lu.json";
import ES from "@/lib/network-es.json";
import { toMin } from "@/lib/format";

export const W = 1000;
const cache = {};
const NETWORKS = { fr: () => FR, ch: () => CH, be: () => BE, nl: () => NL, lu: () => LU, es: () => ES, all: () => mergeNetworks(FR, SUBS()) };

// One map per view: getGeo("fr"), getGeo("ch"), getGeo("be"), getGeo("nl"), getGeo("lu"), getGeo("es") or getGeo("all") for all countries together
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

// All countries on one map. Stations of a country network that already exist in the French network
// (Genève, Basel, Lille, Bruxelles…) become one station, French track inside that country is replaced by the
// more detailed country network, and every track section is drawn only once.
const CH_MAJOR = new Set(["GVA", "BE", "ZH", "LUG"]); // the only Swiss city labels shown at full-map zoom (it is crowded there)
const BE_MAJOR = new Set(["ANT", "LIE"]); // Belgian labels at full-map zoom (Brussels has its own fanned-out pins)
const NL_MAJOR = new Set(["RTD", "UT"]); // Dutch labels at full-map zoom (plus Amsterdam and Den Haag, see flatGroups)
const ES_MAJOR = new Set(["BCN", "SVQ", "VLC", "ZAZ", "AGP", "BIO"]); // Spanish labels at full-map zoom (plus Madrid, see flatGroups)
const SUBS = () => [
  { net: CH, prefix: "ch", major: CH_MAJOR, snap: 0.035 },
  // Belgium: its names (bilingual Brussels stations) win, and French track touching Belgium (Lille–Bruxelles) is redrawn by the Belgian network
  { net: BE, prefix: "be", major: BE_MAJOR, snap: 0.03, preferNames: true, dropTouching: true, mergeLabels: ["ns"] },
  // Netherlands: its border stations (Roosendaal, Breda, Maastricht, Antwerpen) join the Belgian ones already on the map
  // flatGroups: on the crowded combined map Amsterdam and Den Haag get one pin each instead of a fan of stations
  { net: NL, prefix: "nl", major: NL_MAJOR, snap: 0.03, ownNames: true, flatGroups: true },
  // Luxembourg: its lines replace the French and Belgian track that ends in Luxembourg (Thionville–, Arlon–Luxembourg)
  { net: LU, prefix: "lu", major: new Set(["LUX"]), snap: 0.025, ownNames: true, dropTouching: true, replacePrev: true },
  // Spain: Figueres, Girona and Barcelona join the French stations already on the map (Spanish names win there),
  // the French track into Spain (Perpignan–Barcelona) is redrawn by the Spanish network, Madrid gets one pin
  { net: ES, prefix: "es", major: ES_MAJOR, snap: 0.03, ownNames: true, flatGroups: true, dropTouching: true },
];
function mergeNetworks(fr, subs) {
  const nodes = {}, alias = {};
  const pad = (v) => [v[0], v[1], v[2] ?? null, v[3] ?? 0, v[4] ?? null, v[5] ?? null, v[6] ?? null];
  const areaOf = (v) => subs.find((sub) => inside(sub.net.land[0], v[1], v[0]));
  // last value = how close (degrees) a real stop must be to count as this station: tighter in dense Switzerland and Belgium
  for (const [k, v] of Object.entries(fr.nodes)) nodes[k] = [...pad(v), areaOf(v)?.snap ?? 0.1];
  const seen = new Set(), lines = [];
  const add = (type, a, b) => {
    const key = a < b ? a + "|" + b : b + "|" + a;
    if (a === b || seen.has(key)) return;
    seen.add(key); lines.push([type, [a, b]]);
  };
  for (const sub of subs) {
    const groupSeen = new Set();
    for (const [k, v] of Object.entries(sub.net.nodes)) {
      if (v[2]) {
        // the same station already on the map (French network or a country added before this one)
        const twin = Object.entries(nodes).find(([key, f]) => f[2] && !key.startsWith(sub.prefix + "_") && Math.hypot(f[0] - v[0], f[1] - v[1]) < 0.025);
        if (twin) {
          alias[sub.prefix + k] = twin[0];
          if (sub.major.has(k)) nodes[twin[0]][3] = 1;
          // the country's own names win: Brussels groups (Belgium), Dutch stations that the Belgian map also shows (Netherlands)
          if ((sub.preferNames && v[6]) || (sub.ownNames && inside(sub.net.land[0], v[1], v[0]))) nodes[twin[0]] = [nodes[twin[0]][0], nodes[twin[0]][1], ...pad(v).slice(2), sub.snap];
          continue;
        }
      }
      if (sub.flatGroups && v[6]) {
        const first = !groupSeen.has(v[6]);
        groupSeen.add(v[6]);
        nodes[sub.prefix + "_" + k] = [v[0], v[1], v[2], first ? 1 : 0, first ? v[6] : null, first ? "l" : null, null, sub.snap];
        continue;
      }
      const lvl = v[3] === 1 && !sub.major.has(k) ? 2 : v[3];
      nodes[sub.prefix + "_" + k] = [...pad(v).slice(0, 3), lvl || 0, ...pad(v).slice(4), sub.snap];
    }
    const id = (k) => alias[sub.prefix + k] || sub.prefix + "_" + k;
    if (sub.replacePrev) {
      // track already drawn by an earlier country that runs into this one is drawn again by this country's own network
      const inLand = (key) => inside(sub.net.land[0], nodes[key][1], nodes[key][0]);
      for (let i = lines.length - 1; i >= 0; i--) {
        const [a, b] = lines[i][1];
        if (inLand(a) || inLand(b)) { seen.delete(a < b ? a + "|" + b : b + "|" + a); lines.splice(i, 1); }
      }
    }
    for (const [type, path] of sub.net.lines) for (let i = 1; i < path.length; i++) add(type, id(path[i - 1]), id(path[i]));
  }
  for (const [type, path] of fr.lines) {
    for (let i = 1; i < path.length; i++) {
      const a = fr.nodes[path[i - 1]], b = fr.nodes[path[i]];
      const covered = subs.some((sub) => {
        const ia = inside(sub.net.land[0], a[1], a[0]), ib = inside(sub.net.land[0], b[1], b[0]);
        return sub.dropTouching ? ia || ib : ia && ib;
      });
      if (covered) continue; // that country's network covers this
      add(type, path[i - 1], path[i]);
    }
  }
  const all = [fr, ...subs.map((x) => x.net)];
  const drawn = new Set(subs.map((x) => x.prefix));
  const extra = subs.flatMap((x) => x.net.labels.filter(([k]) => (x.mergeLabels || []).includes(k))); // e.g. "North Sea" from the Belgian map
  return {
    bounds: {
      lon0: Math.min(...all.map((n) => n.bounds.lon0)), lon1: Math.max(...all.map((n) => n.bounds.lon1)),
      lat0: Math.min(...all.map((n) => n.bounds.lat0)), lat1: Math.max(...all.map((n) => n.bounds.lat1)),
    },
    nodes, lines,
    land: all.flatMap((n) => n.land),
    water: all.flatMap((n) => n.water || []),
    labels: [...fr.labels.filter(([k]) => !drawn.has(k)), ...extra],
  };
}

function createGeo(NET, country) {
  const { lon0: LON0, lon1: LON1, lat0: LAT0, lat1: LAT1 } = NET.bounds;
  const COS = Math.cos((((LAT0 + LAT1) / 2) * Math.PI) / 180);
  const SNAP = country === "ch" ? 0.035 : country === "be" || country === "nl" ? 0.03 : country === "lu" ? 0.025 : country === "es" ? 0.03 : 0.1; // how close (degrees) a real stop must be to count as a map station
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
  // A stop outside this map (e.g. Paris on the Swiss map) is not placed at all,
  // so a cross-border train is shown only on the part of its trip that is on this map.
  const M = 0.15;
  const onMap = (s) => s.lat >= LAT0 - M && s.lat <= LAT1 + M && s.lon >= LON0 - M && s.lon <= LON1 + M;
  function stopNode(s) {
    const key = s.lat != null ? `${s.lat},${s.lon}` : "n:" + s.name;
    if (snapCache.has(key)) return snapCache.get(key);
    let best = null;
    if (s.lat != null && !onMap(s)) { snapCache.set(key, null); return null; }
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

  // Map point of a selected station (map station, group like "Paris", or a stop name from the menu)
  function stationPoint(sel, trains = []) {
    const hits = stations.filter((n) => n.name === sel || n.group === sel);
    if (!hits.length) {
      for (const tr of trains) {
        const s = (tr.stops || []).find((x) => x.name === sel);
        const n = s && stopNode(s);
        if (n) { hits.push(n); break; }
      }
    }
    if (!hits.length) return null;
    return [hits.reduce((a, n) => a + n.x, 0) / hits.length, hits.reduce((a, n) => a + n.y, 0) / hits.length];
  }

  // Does every stop of this train fit on this map?
  const fitsTrain = (tr) => (tr.stops || []).every((s) => s.lat == null || onMap(s));

  return { NET, W, H, proj, nodes, stations, route, stopNode, trainPos, trainRoute, stopMatches, stationPoint, fitsTrain, country };
}
