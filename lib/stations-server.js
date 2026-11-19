// Server side of the station pages: the list of station pages (station_page_json, ~900 rows), read in one call and
// kept in the server's memory for an hour (lib/listcache.js), so one page view costs one small database call (station_info).
import { cachedList } from "./listcache";
import { stationSlug, stationPageHref } from "./stationpage";

export const stationList = cachedList("station_page_json", ([country, name, trains, last_day]) => ({ country, name, trains, last_day }));

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

// Station name → page address, for the station names of one country that have a page (links on train and route pages)
// (only extra links: if the list cannot be read, the page shows the names without links)
export async function stationLinks(country, names) {
  let list;
  try { list = await stationAddresses(); } catch { return {}; }
  const have = new Map(list.filter((r) => r.country === country).map((r) => [r.name, r]));
  const out = {};
  for (const n of names) if (n && have.has(n)) out[n] = stationPageHref(country, n);
  return out;
}
