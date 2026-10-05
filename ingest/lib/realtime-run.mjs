// Jedno osvežavanje kašnjenja za jednu zemlju. Koriste ga i GitHub skripta (sync-realtime.mjs)
// i Supabase Edge funkcija (supabase/functions/sync-realtime), koja se pokreće na svakih nekoliko minuta.
import { decodeFeed } from "./gtfs-rt.mjs";
import { applyTripUpdate, matchRow, onTimeUpdate } from "./realtime.mjs";
import { BE_TRIPS_URL, feedFromJson } from "./belgium.mjs";
import { NL_TRAINS_URL, NL_HEADERS } from "./netherlands.mjs";
import { parisDate, chunks } from "./util.mjs";

export const FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates", headers: () => ({}) },
  // https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/gtfs-rt/ (najviše 2 zahteva u minuti)
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-rt", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }) },
  // SNCB: GTFS-RT as JSON, only trains with a deviation; missing running trains are on time (onlyDeviations)
  be: { url: BE_TRIPS_URL, headers: () => ({ Accept: "application/json" }), json: true, onlyDeviations: true },
  // NS / NDOV via OVapi: every train of today and tomorrow (protobuf), delays, cancellations and track changes
  nl: { url: NL_TRAINS_URL, headers: () => NL_HEADERS },
};

// protobuf (fr, ch) or JSON (be) -> decoded feed
export function readFeed(country, buf, keep) {
  if (FEEDS[country]?.json) return feedFromJson(JSON.parse(new TextDecoder().decode(buf)), keep);
  return decodeFeed(buf, keep);
}

export async function loadTrains(db, country) {
  const days = [parisDate(-1), parisDate(0)].join(",");
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db.select("trains", `select=id,trip_id,service_date,stops,delay_min,cancelled&country=eq.${country}&service_date=in.(${days})&order=id&limit=1000&offset=${offset}`);
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

export async function fetchFeed(country, swissKey) {
  const f = FEEDS[country];
  const res = await fetch(f.url, { headers: { "User-Agent": "train-punctuality-ingest/1.0", ...f.headers(swissKey) } });
  if (!res.ok) throw new Error(`Preuzimanje ${f.url} nije uspelo: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// trains: redovi iz baze; feedBuf: GTFS-RT bajtovi. Vraća izmene za apply_rt_updates.
export function computeUpdates(trains, feedBuf, nowSec, country = "fr") {
  const index = new Map();
  for (const r of [...trains].sort((a, b) => a.service_date.localeCompare(b.service_date))) {
    if (!index.has(r.trip_id)) index.set(r.trip_id, []);
    index.get(r.trip_id).push(r);
  }
  const feed = readFeed(country, feedBuf, (trip) => !!trip?.tripId && index.has(trip.tripId));
  let matched = 0, changed = 0;
  const updates = [];
  for (const ent of feed.entities) {
    const tu = ent.tripUpdate;
    if (!tu || ent.isDeleted) continue;
    const row = matchRow(index, tu.trip);
    if (!row) continue;
    matched++;
    const res = applyTripUpdate(row, tu, nowSec);
    const diff = res.delay_min !== row.delay_min || res.cancelled !== row.cancelled ||
      JSON.stringify(res.stops.map((s) => [s.delay, s.skipped])) !== JSON.stringify(row.stops.map((s) => [s.delay ?? 0, !!s.skipped]));
    // Every train found in the feed is written, so the site knows it was checked (rt_updated_at)
    updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, stops: res.stops });
    if (diff) changed++;
  }
  if (FEEDS[country]?.onlyDeviations) {
    const seen = new Set(updates.map((u) => u.id));
    for (const row of trains) {
      if (seen.has(row.id)) continue;
      const res = onTimeUpdate(row, nowSec);
      if (res) updates.push(res);
    }
  }
  return { updates, matched, changed, entities: feed.entities.length };
}

export async function writeUpdates(db, updates) {
  for (const part of chunks(updates, 300)) await db.rpc("apply_rt_updates", { payload: part });
}
