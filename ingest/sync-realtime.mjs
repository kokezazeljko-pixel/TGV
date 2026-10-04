// Na svakih nekoliko minuta: čita GTFS-RT feed i upisuje kašnjenja u tabelu "trains".
// COUNTRY=fr (SNCF, podrazumevano) ili COUNTRY=ch (Švajcarska, traži SWISS_API_KEY).
//
// Pokretanje:  node ingest/sync-realtime.mjs
//              COUNTRY=ch SWISS_API_KEY=... node ingest/sync-realtime.mjs
// Za probu bez baze:  DRY_RUN=1 RT_FILE=feed.pb TRAINS_FILE=trains.dry.json node ingest/sync-realtime.mjs
import { readFile, writeFile } from "node:fs/promises";
import { decodeFeed } from "./lib/gtfs-rt.mjs";
import { applyTripUpdate, matchRow } from "./lib/realtime.mjs";
import { parisDate, env, supabaseRest, download, chunks } from "./lib/util.mjs";

const COUNTRY = env("COUNTRY", "fr");
const FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates", headers: () => ({}) },
  // https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/gtfs-rt/ (najviše 2 zahteva u minuti)
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-rt", headers: () => ({ Authorization: `Bearer ${env("SWISS_API_KEY")}`, "Accept-Encoding": "br, gzip, deflate" }) },
};
if (!FEEDS[COUNTRY]) throw new Error(`Nepoznata zemlja COUNTRY=${COUNTRY} (dozvoljeno: fr, ch)`);
const RT_URL = env("RT_URL", FEEDS[COUNTRY].url);
const DRY = env("DRY_RUN", "") !== "";
const NOW = Number(env("NOW", "")) || Math.floor(Date.now() / 1000);

async function loadTrains(db) {
  if (process.env.TRAINS_FILE) return JSON.parse(await readFile(process.env.TRAINS_FILE, "utf8"));
  const days = [parisDate(-1), parisDate(0)].join(",");
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db.select("trains", `select=id,trip_id,service_date,stops,delay_min,cancelled&country=eq.${COUNTRY}&service_date=in.(${days})&order=id&limit=1000&offset=${offset}`);
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

async function main() {
  const db = DRY ? null : supabaseRest();
  const [feedBuf, trains] = await Promise.all([
    process.env.RT_FILE ? readFile(process.env.RT_FILE) : download(RT_URL, FEEDS[COUNTRY].headers()),
    loadTrains(db),
  ]);
  const feed = decodeFeed(feedBuf);
  console.log(`Feed: ${feed.entities.length} poruka · vozova u bazi: ${trains.length}`);

  const index = new Map();
  for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date))) {
    if (!index.has(r.trip_id)) index.set(r.trip_id, []);
    index.get(r.trip_id).push(r);
  }

  let matched = 0, changedCount = 0;
  const updates = [];
  for (const ent of feed.entities) {
    const tu = ent.tripUpdate;
    if (!tu || ent.isDeleted) continue;
    const row = matchRow(index, tu.trip);
    if (!row) continue;
    matched++;
    const res = applyTripUpdate(row, tu, NOW);
    const changed = res.delay_min !== row.delay_min || res.cancelled !== row.cancelled ||
      JSON.stringify(res.stops.map((s) => [s.delay, s.skipped])) !== JSON.stringify(row.stops.map((s) => [s.delay ?? 0, !!s.skipped]));
    // Every train found in the feed is written, so the site knows SNCF has checked it (rt_updated_at)
    updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, stops: res.stops });
    if (changed) changedCount++;
  }
  console.log(`[${COUNTRY}] Prepoznato vozova u feedu: ${matched} · promenjeno: ${changedCount}`);

  if (DRY) {
    const out = env("OUT_FILE", "updates.dry.json");
    await writeFile(out, JSON.stringify(updates, null, 2));
    console.log(`DRY_RUN: izmene sačuvane u ${out}`);
    return;
  }
  for (const part of chunks(updates, 300)) await db.rpc("apply_rt_updates", { payload: part });
  console.log("Gotovo: kašnjenja su ažurirana.");
}

main().catch((e) => { console.error(e); process.exit(1); });
