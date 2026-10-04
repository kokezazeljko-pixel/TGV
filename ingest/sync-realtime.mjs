// Čita GTFS-RT feed i upisuje kašnjenja u tabelu "trains".
// Glavno automatsko osvežavanje radi Supabase Edge funkcija (supabase/functions/sync-realtime) na svakih
// nekoliko minuta; ova skripta služi za ručno pokretanje sa GitHub-a i za probe.
// COUNTRY=fr (SNCF, podrazumevano) ili COUNTRY=ch (Švajcarska, traži SWISS_API_KEY).
//
// Pokretanje:  node ingest/sync-realtime.mjs
//              COUNTRY=ch SWISS_API_KEY=... node ingest/sync-realtime.mjs
// Za probu bez baze:  DRY_RUN=1 RT_FILE=feed.pb TRAINS_FILE=trains.dry.json node ingest/sync-realtime.mjs
import { readFile, writeFile } from "node:fs/promises";
import { env, supabaseRest } from "./lib/util.mjs";
import { FEEDS, loadTrains, fetchFeed, computeUpdates, writeUpdates } from "./lib/realtime-run.mjs";

const COUNTRY = env("COUNTRY", "fr");
if (!FEEDS[COUNTRY]) throw new Error(`Nepoznata zemlja COUNTRY=${COUNTRY} (dozvoljeno: fr, ch)`);
const DRY = env("DRY_RUN", "") !== "";
const NOW = Number(env("NOW", "")) || Math.floor(Date.now() / 1000);

async function main() {
  const db = DRY ? null : supabaseRest();
  const [feedBuf, trains] = await Promise.all([
    process.env.RT_FILE ? readFile(process.env.RT_FILE) : fetchFeed(COUNTRY, COUNTRY === "ch" ? env("SWISS_API_KEY") : ""),
    process.env.TRAINS_FILE ? readFile(process.env.TRAINS_FILE, "utf8").then(JSON.parse) : loadTrains(db, COUNTRY),
  ]);
  const { updates, matched, changed, entities } = computeUpdates(trains, feedBuf, NOW);
  console.log(`Feed: ${entities} poruka za naše vozove · vozova u bazi: ${trains.length}`);
  console.log(`[${COUNTRY}] Prepoznato vozova u feedu: ${matched} · promenjeno: ${changed}`);

  if (DRY) {
    const out = env("OUT_FILE", "updates.dry.json");
    await writeFile(out, JSON.stringify(updates, null, 2));
    console.log(`DRY_RUN: izmene sačuvane u ${out}`);
    return;
  }
  await writeUpdates(db, updates);
  console.log("Gotovo: kašnjenja su ažurirana.");
}

main().catch((e) => { console.error(e); process.exit(1); });
