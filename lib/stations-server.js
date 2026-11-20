// Server side of the station pages: the list of station pages (station_page_json, ~900 rows), read in one call and
// kept in the server's memory for an hour (lib/listcache.js), so one page view costs one small database call (station_info).
import { cachedList } from "./listcache";
import { stationSlug, stationPageHref } from "./stationpage";

export const stationList = cachedList("station_page_json", ([country, name, trains, last_day, lat, lon]) => ({ country, name, trains, last_day, lat, lon }));

// One page per address: when two stations share a short name, the busier one has it
export async function stationAddresses() {
  const best = new Map();
  for (const r of await stationList()) {
    const k = r.country + "/" + stationSlug(r.name);
    if (!best.has(k) || best.get(k).trains < r.trains) best.set(k, r);
  }
  return [...best.values()];
}

export async function findStation(country, slug) {
  return (await stationAddresses()).find((r) => r.country === country && stationSlug(r.name) === slug) || null;
}

// Station name → page address, for the stops of a train or route that have a station page (links on train and route pages).
// A stop is a name, or { name, lat, lon }. First the same name in the train's own country; for a stop abroad
// (ICE München → Amsterdam in the Dutch data: "München Hbf", "Frankfurt Flughafen Fernb") the station page of
// another country within about 800 m whose name starts with the same word ("frankfurt").
// Only extra links: if the list cannot be read, the page shows the names without links.
const firstWord = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+/)?.[0] || "";
export async function stationLinks(country, stops) {
  let list;
  try { list = await stationAddresses(); } catch { return {}; }
  const own = new Map(list.filter((r) => r.country === country).map((r) => [r.name, r]));
  const out = {};
  for (const st of stops || []) {
    const s = typeof st === "string" ? { name: st } : st || {};
    if (!s.name || out[s.name]) continue;
    if (own.has(s.name)) { out[s.name] = stationPageHref(country, s.name); continue; }
    if (s.lat == null || s.lon == null) continue;
    const w = firstWord(s.name);
    let best = null, bd = 1e9;
    for (const r of list) {
      if (r.lat == null || firstWord(r.name) !== w) continue;
      const d = Math.hypot(r.lat - s.lat, (r.lon - s.lon) * Math.cos((s.lat * Math.PI) / 180)) * 111000;
      if (d < 800 && d < bd) { bd = d; best = r; }
    }
    if (best) out[s.name] = stationPageHref(best.country, best.name);
  }
  return out;
}
