// Compact form of the day's trains, sent with the home page (about 6× smaller than the database rows, so the
// page loads faster and uses less Vercel transfer). Station names and coordinates are listed once; each stop is
// [station number, time, delay, planned platform, changed platform], with the empty ends left out.
// unpackTrains() turns it back into the same train objects the page always used (only the stop fields it needs).
import { plannedPf } from "./format";

export function packTrains(rows, day) {
  const stations = [], index = new Map();
  const pre = day + "_";
  const trains = rows.map((r) => {
    const stops = (r.stops || []).map((s) => {
      const key = `${s.name}|${s.lat}|${s.lon}`;
      let i = index.get(key);
      if (i == null) { i = stations.length; index.set(key, i); stations.push([s.name ?? null, s.lat ?? null, s.lon ?? null]); }
      const a = [i, s.time ?? null, s.delay || 0, plannedPf(s), s.apf || null];
      while (a.length > 2 && !a[a.length - 1]) a.pop();
      return a;
    });
    // ids start with the travel day ("2026-10-15_de_…"): only the rest is sent; "!" marks an id without it
    const id = r.id.startsWith(pre) ? r.id.slice(pre.length) : "!" + r.id;
    return [id, r.number, r.type, r.origin, r.destination, r.dep, r.arr, r.delay_min, r.cancelled ? 1 : 0, r.rt_updated_at, r.country, stops];
  });
  return { day, stations, trains };
}

export function unpackTrains(p) {
  if (!p || Array.isArray(p)) return p || []; // already a plain list
  const pre = p.day + "_";
  return p.trains.map(([id, number, type, origin, destination, dep, arr, delay_min, cancelled, rt_updated_at, country, stops]) => ({
    id: id.startsWith("!") ? id.slice(1) : pre + id,
    number, type, origin, destination, dep, arr, delay_min, cancelled: !!cancelled, rt_updated_at, service_date: p.day, country,
    stops: stops.map(([i, time, delay = 0, pf = null, apf = null]) => {
      const [name, lat, lon] = p.stations[i];
      const s = { name, lat, lon, time, delay };
      if (pf) s.pf = pf;
      if (apf) s.apf = apf;
      return s;
    }),
  }));
}
