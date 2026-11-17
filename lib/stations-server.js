// Server side of the station pages: the list of station pages (station_page_list, ~900 rows), kept in the server's
// memory for an hour, so one page view costs one small database call (station_info).
import { getServerClient, isConfigured } from "./supabase";
import { stationSlug, stationPageHref } from "./stationpage";

let cache = { at: 0, rows: null };

export async function stationList() {
  if (!isConfigured) return [];
  if (cache.rows && Date.now() - cache.at < 3600000) return cache.rows;
  const sb = getServerClient(), rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.rpc("station_page_list").range(from, from + 999);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (rows.length) cache = { at: Date.now(), rows };
  return rows;
}

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
export async function stationLinks(country, names) {
  const have = new Map((await stationAddresses()).filter((r) => r.country === country).map((r) => [r.name, r]));
  const out = {};
  for (const n of names) if (n && have.has(n)) out[n] = stationPageHref(country, n);
  return out;
}
