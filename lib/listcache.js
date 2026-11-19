// A list the server keeps in memory for an hour (route pages, station pages), read in ONE database call.
// Never a partial list: until 19.11.2026 the route list was read in pages of 1000 rows, and when one page hit the
// database's statement timeout (busy moments, 17.11) the rest was missing for an hour, so those pages answered
// "Not found (404)" to Google. Now a failed read is retried once; if it still fails, the last good list is used,
// and with no list at all the page fails with a server error (5xx), which search engines treat as temporary.
import { getServerClient, isConfigured } from "./supabase";

export function cachedList(fn, map, ttl = 3600000) {
  let cache = { at: 0, rows: null }, pending = null;
  const read = async () => {
    const { data, error } = await getServerClient().rpc(fn);
    if (error || !Array.isArray(data)) throw Error(`${fn}: ${error?.message || "no data"}`);
    return data.map(map);
  };
  return async () => {
    if (!isConfigured) return [];
    if (cache.rows && Date.now() - cache.at < ttl) return cache.rows;
    if (!pending) pending = (async () => {
      try {
        let rows;
        try { rows = await read(); } catch { await new Promise((r) => setTimeout(r, 400)); rows = await read(); }
        cache = { at: Date.now(), rows };
        return rows;
      } catch (e) {
        if (cache.rows) { cache.at = Date.now() - ttl + 120000; return cache.rows; } // keep the old list, try again in 2 min
        throw e;
      } finally { pending = null; }
    })();
    return pending;
  };
}
