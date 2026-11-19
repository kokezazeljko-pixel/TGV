// Server side of the route pages: the list of routes (route_list_json: origin → destination of trains, kind "od",
// and pairs of busy stations, kind "pair"), read in one call and kept in the server's memory for an hour
// (lib/listcache.js), so one page view costs one small database call (route_page_info or route_pair_info).
import { cachedList } from "./listcache";
import { routeSlug } from "./routepage";

export const routeList = cachedList("route_list_json", ([country, origin, destination, runs, last_day, kind]) => ({ country, origin, destination, runs, last_day, kind }));

// The route behind an address; a city pair covers every train between the two stations, so it wins over the
// origin → destination route of the same address; when two stations share a short name, the busier one wins
export async function findRoute(country, slug) {
  const rows = (await routeList()).filter((r) => r.country === country && routeSlug(r.origin, r.destination) === slug);
  return rows.sort((a, b) => (b.kind === "pair") - (a.kind === "pair") || b.runs - a.runs)[0] || null;
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
