// Jednom dnevno: preuzima SNCF red vožnje (GTFS), bira TGV vozove za danas i sutra
// i upisuje ih u tabelu "trains" u Supabase-u.
//
// Pokretanje:  node ingest/sync-schedule.mjs
// Za probu bez baze:  DRY_RUN=1 GTFS_FILE=putanja.zip node ingest/sync-schedule.mjs
import { readFile, writeFile } from "node:fs/promises";
import { listZip, openEntry } from "./lib/zip.mjs";
import { eachRow } from "./lib/csv.mjs";
import { parisDate, hhmm, detectType, productFromStopId, env, supabaseRest, download, chunks } from "./lib/util.mjs";

const GTFS_URL = env("GTFS_URL", "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip");
const TYPES = env("TRAIN_TYPES", "TGV INOUI,OUIGO,TGV Lyria").split(",").map((s) => s.trim());
const DAYS = Number(env("DAYS", "2"));
const DRY = env("DRY_RUN", "") !== "";
const TODAY = env("TODAY", "") || parisDate(0);

const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dates = Array.from({ length: DAYS }, (_, i) => addDays(TODAY, i));
const ymd = (iso) => iso.replaceAll("-", "");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function main() {
  console.log(`Red vožnje za: ${dates.join(", ")} · vrste: ${TYPES.join(", ")}`);
  const zip = process.env.GTFS_FILE ? await readFile(process.env.GTFS_FILE) : await download(GTFS_URL);
  console.log(`GTFS: ${(zip.length / 1e6).toFixed(1)} MB`);
  const files = listZip(zip);
  const read = async (name, fn) => { const e = files.get(name); if (e) await eachRow(openEntry(zip, e), fn); return !!e; };

  // 1) Koji servisi (kalendari) voze kog dana
  const active = new Map(dates.map((d) => [d, new Set()]));
  await read("calendar.txt", (r) => {
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1") active.get(d).add(r.service_id);
    }
  });
  await read("calendar_dates.txt", (r) => {
    for (const d of dates) {
      if (r.date !== ymd(d)) continue;
      if (r.exception_type === "1") active.get(d).add(r.service_id);
      if (r.exception_type === "2") active.get(d).delete(r.service_id);
    }
  });

  // 2) Linije i vožnje
  const routes = new Map();
  await read("routes.txt", (r) => routes.set(r.route_id, r));
  const trips = new Map();
  await read("trips.txt", (r) => {
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length) trips.set(r.trip_id, { ...r, runs, stops: [] });
  });
  console.log(`Vožnji u izabranim danima (sve vrste): ${trips.size}`);

  // 3) Stanice po vožnji (najveći fajl – čita se kao stream)
  await read("stop_times.txt", (r) => {
    const t = trips.get(r.trip_id);
    if (t) t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  });

  // 4) Vrsta voza i filtriranje
  const typeCount = {};
  const keep = [];
  for (const t of trips.values()) {
    if (!t.stops.length) continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const route = routes.get(t.route_id) || {};
    t.type = detectType(productFromStopId(t.stops[0].id), route.route_short_name, route.route_long_name, route.route_desc);
    typeCount[t.type] = (typeCount[t.type] || 0) + 1;
    if (TYPES.includes(t.type)) keep.push(t);
  }
  console.log("Prepoznate vrste vozova:", typeCount);

  const needStops = new Set(keep.flatMap((t) => t.stops.map((s) => s.id)));
  const stopNames = new Map();
  await read("stops.txt", (r) => { if (needStops.has(r.stop_id)) stopNames.set(r.stop_id, r.stop_name); });

  // 5) Redovi za bazu
  const rows = [];
  for (const t of keep) {
    const stops = t.stops.map((s) => ({ ...s, name: stopNames.get(s.id) || s.id, time: hhmm(s.dep || s.arr), delay: 0 }));
    const first = stops[0], last = stops[stops.length - 1];
    for (const d of t.runs) {
      rows.push({
        id: `${d}_${t.trip_id}`,
        trip_id: t.trip_id,
        service_date: d,
        number: t.trip_short_name || t.trip_headsign || t.trip_id,
        type: t.type,
        origin: first.name,
        destination: last.name,
        dep: hhmm(first.dep || first.arr),
        arr: hhmm(last.arr || last.dep),
        stops,
      });
    }
  }
  console.log(`Vozova za upis: ${rows.length}`);

  if (DRY) {
    const out = env("OUT_FILE", "trains.dry.json");
    await writeFile(out, JSON.stringify(rows, null, 2));
    console.log(`DRY_RUN: redovi sačuvani u ${out}`);
    return;
  }

  const db = supabaseRest();
  for (const part of chunks(rows, 500)) await db.upsert("trains", part);
  await db.del("trains", `service_date=lt.${addDays(TODAY, -2)}`);
  console.log("Gotovo: red vožnje je upisan.");
}

main().catch((e) => { console.error(e); process.exit(1); });
