// Server side of the route pages: the list of routes (route_page_list), read in pages of 1000 rows and kept
// in the server's memory for an hour, so one page view costs one small database call (route_page_info).
import { getServerClient, isConfigured } from "./supabase";
import { routeSlug } from "./routepage";

let cache = { at: 0, rows: null };

export async function routeList() {
  if (!isConfigured) return [];
  if (cache.rows && Date.now() - cache.at < 3600000) return cache.rows;
  const sb = getServerClient(), rows = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await sb.rpc("route_page_list").range(from, from + 999);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (rows.length) cache = { at: Date.now(), rows };
  return rows;
}

// The route behind an address; when two stations share a short name, the busier route wins
export async function findRoute(country, slug) {
  const rows = (await routeList()).filter((r) => r.country === country && routeSlug(r.origin, r.destination) === slug);
  return rows.sort((a, b) => b.runs - a.runs)[0] || null;
}

// Distinct addresses for the sitemap (the busier route of two with the same address)
export async function routeAddresses() {
  const best = new Map();
  for (const r of await routeList()) {
    const k = r.country + "/" + routeSlug(r.origin, r.destination);
    if (!best.has(k) || best.get(k).runs < r.runs) best.set(k, r);
  }
  return [...best.values()];
}
