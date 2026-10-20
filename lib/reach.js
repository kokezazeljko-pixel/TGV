// "Direct destinations" of a selected station: the stations today's trains reach from it without a change.
// Used by the station panel (list of destinations) and the map (the network lighting up from the station).
import { getGeo } from "@/lib/geo";

export const normName = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\bhall\b|\d+/g, " ").replace(/[^a-z]+/g, " ").trim();

// The same station in two countries' data ("Brussel-Noord" / "Bruxelles-Nord / Brussel-Noord", "Breda" / "Breda (NL)"):
// names where one contains the other, less than 1.5 km apart. Map stations are not used for this, their catchment
// is too wide (Lille Flandres would become Lille Europe).
const NEAR = 0.0135; // ~1.5 km in degrees of latitude
export const sameDest = (a, b) => {
  const x = normName(a.name || ""), y = normName(b.name || "");
  if (!x || !y || !(x === y || x.includes(y) || y.includes(x))) return false;
  if (a.lat == null || b.lat == null) return x === y;
  return Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) < NEAR;
};

// Is this stop the selected station? The map's rule, plus the same station under another country's spelling
// (the Dutch data's "Brussel-Zuid" when "Bruxelles-Midi / Brussel-Zuid" is selected).
export function hereMatcher(trains, station, stopMatches) {
  let ref = null;
  for (const tr of trains) { ref = (tr.stops || []).find((s) => s.lat != null && stopMatches(s, station)); if (ref) break; }
  return (s) => stopMatches(s, station) || (!!ref && sameDest(ref, s));
}

// The map part: every track section the trains from the station run on after it (each drawn once), with how far
// along the network from the station it starts, and every station they stop at with its distance from the station.
// The map lets the colour run out along the tracks in that order.
export function reachOnMap(country, trains, station) {
  const geo = getGeo(country);
  const here = hereMatcher(trains, station, geo.stopMatches);
  const hops = new Map(), stops = new Map();
  const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  for (const tr of trains) {
    const st = (tr.stops || []).filter((s) => geo.stopNode(s));
    const i = st.findIndex(here);
    if (i < 0) continue;
    let at = 0;
    for (let j = i + 1; j < st.length; j++) {
      if (here(st[j])) continue;
      const pts = geo.pathBetween(st[j - 1], st[j]);
      if (!pts || pts.length < 2) continue;
      const L = len(pts), a = pts[0], b = pts[pts.length - 1];
      const key = `${a[0].toFixed(1)},${a[1].toFixed(1)}>${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      const h = hops.get(key);
      if (!h) hops.set(key, { pts, from: at, len: L });
      else if (at < h.from) h.from = at;
      at += L;
      const n = geo.stopNode(st[j]), sk = `${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      const s = stops.get(sk);
      if (!s) stops.set(sk, { x: b[0], y: b[1], at, name: n?.name || st[j].name, big: !!(n && !n.virtual && (n.lvl === 1 || n.group)) });
      else if (at < s.at) s.at = at;
    }
  }
  const list = [...hops.values()], dots = [...stops.values()];
  const far = Math.max(1e-6, ...list.map((h) => h.from + h.len));
  return { hops: list, dots, far };
}
