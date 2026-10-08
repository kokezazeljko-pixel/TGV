// Preuzima red vožnje (GTFS), bira međugradske vozove za danas i sutra
// i upisuje ih u tabelu "trains" u Supabase-u.
//
// Zemlja se bira promenljivom COUNTRY: fr (SNCF, podrazumevano), ch (Švajcarska), be (Belgija, SNCB), nl (Holandija, NS) ili lu (Luksemburg, CFL).
// Pokretanje:  node ingest/sync-schedule.mjs          (Francuska)
//              COUNTRY=ch node ingest/sync-schedule.mjs (Švajcarska)
//              COUNTRY=be node ingest/sync-schedule.mjs (Belgija)
//              COUNTRY=nl node ingest/sync-schedule.mjs (Holandija)
//              COUNTRY=lu node ingest/sync-schedule.mjs (Luksemburg)
// Za probu bez baze:  DRY_RUN=1 GTFS_FILE=putanja.zip node ingest/sync-schedule.mjs
import { readFile, writeFile } from "node:fs/promises";
import { listZip, openEntry } from "./lib/zip.mjs";
import { eachRow } from "./lib/csv.mjs";
import { parisDate, hhmm, detectType, detectSwissType, productFromStopId, env, supabaseRest, download, chunks, latestSwissGtfsUrl, platformOf } from "./lib/util.mjs";
import { BE_STATIC_URL, detectBelgianType, isBelgianStop, localName } from "./lib/belgium.mjs";
import { NL_STATIC_URL, NL_HEADERS, detectDutchType, stationCode } from "./lib/netherlands.mjs";
import { latestLuxGtfsUrl, detectLuxType, isLuxStop, luxStopName, luxNumber } from "./lib/luxembourg.mjs";

const COUNTRY = env("COUNTRY", "fr");
const CONFIG = {
  fr: { types: "TGV INOUI,OUIGO,TGV Lyria", gtfsUrl: "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip", idPrefix: "" },
  ch: { types: "IC,IR,EC,ICE,TGV Lyria,Railjet,Night train,Panorama", gtfsUrl: null, idPrefix: "ch_" },
  be: { types: "IC,EC,Night train", gtfsUrl: BE_STATIC_URL, idPrefix: "be_" },
  nl: { types: "IC,ICD,ICE,Eurostar,EC,ECD,Night train", gtfsUrl: NL_STATIC_URL, idPrefix: "nl_", headers: NL_HEADERS },
  lu: { types: "RE,IC,EC,TGV,TER,ICE", gtfsUrl: null, idPrefix: "lu_" },
}[COUNTRY];
if (!CONFIG) throw new Error(`Nepoznata zemlja COUNTRY=${COUNTRY} (dozvoljeno: fr, ch, be, nl, lu)`);
const routeType = { ch: detectSwissType, be: detectBelgianType, nl: detectDutchType, lu: detectLuxType }[COUNTRY]; // vrsta voza iz same linije (routes.txt)

const TYPES = env("TRAIN_TYPES", CONFIG.types).split(",").map((s) => s.trim());
const DAYS = Number(env("DAYS", "2"));
const DRY = env("DRY_RUN", "") !== "";
const TODAY = env("TODAY", "") || parisDate(0); // Pariz i Cirih su u istoj vremenskoj zoni

const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dates = Array.from({ length: DAYS }, (_, i) => addDays(TODAY, i));
const ymd = (iso) => iso.replaceAll("-", "");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Švajcarski GTFS sadrži i mnoge strane vozove (npr. francuske TGV Lyon–Nica bez ijedne stanice u Švajcarskoj).
// Zadržavamo samo one koji staju bar na jednoj švajcarskoj stanici (SLOID "ch:..." ili UIC broj 85xxxxx).
// Isto važi za Belgiju (belgijske stanice imaju UIC broj 88xxxxx).
const servesCountry = (t) => COUNTRY === "ch" ? t.stops.some((s) => /^(ch:|85\d{5})/.test(s.id))
  : COUNTRY === "be" ? t.stops.some((s) => isBelgianStop(s.id))
  : COUNTRY === "lu" ? t.stops.some((s) => isLuxStop(s.id)) : true;

// Šatl vozovi (npr. Avignon Centre ↔ Avignon TGV) imaju 6-cifrene brojeve i samo dve stanice
// SNCF: šatlovi imaju broj od 6+ cifara, a autobusi uz TGV (Meuse TGV – Verdun, TGV Haute-Picardie – Amiens…) imaju
// "R" (routier = drumski) u trip_id umesto "F" (ferré) ili route_type 3 – nijedno nije voz
const isShuttle = (t, route = {}) => (COUNTRY === "fr" && (/^\d{6,}$/.test(t.trip_short_name || t.trip_headsign || "") || String(route.route_type).trim() === "3" || /^OCESN\d+R/.test(t.trip_id || ""))) || t.stops.length < 2;

async function main() {
  console.log(`Zemlja: ${COUNTRY} · red vožnje za: ${dates.join(", ")} · vrste: ${TYPES.join(", ")}`);
  let url = env("GTFS_URL", CONFIG.gtfsUrl || "");
  if (!url && !process.env.GTFS_FILE && COUNTRY === "ch") url = await latestSwissGtfsUrl(TODAY);
  if (!url && !process.env.GTFS_FILE && COUNTRY === "lu") url = await latestLuxGtfsUrl(TODAY);
  if (url) console.log(`Izvor: ${url}`);
  const zip = process.env.GTFS_FILE ? await readFile(process.env.GTFS_FILE) : await download(url, CONFIG.headers);
  console.log(`GTFS: ${(zip.length / 1e6).toFixed(1)} MB`);
  const files = listZip(zip);
  const read = async (name, fn, first) => { const e = files.get(name); if (e) await eachRow(openEntry(zip, e), fn, first); return !!e; };

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

  // 2) Linije i vožnje. Za Švajcarsku se vrsta voza zna već iz linije (route_desc),
  //    pa odmah izbacujemo tramvaje, autobuse, S-Bahn… da ne bismo čitali milione nepotrebnih redova.
  const routes = new Map();
  const descCount = {};
  await read("routes.txt", (r) => {
    if (routeType) {
      const cat = COUNTRY === "be" ? ((r.route_short_name || "").match(/^[A-Za-z]+/) || [""])[0] : COUNTRY === "nl" || COUNTRY === "lu" ? `${r.agency_id} ${r.route_short_name}` : r.route_desc;
      descCount[cat] = (descCount[cat] || 0) + 1;
      const type = routeType(r);
      if (type && TYPES.includes(type)) routes.set(r.route_id, { ...r, type });
    } else routes.set(r.route_id, r);
  });
  if (routeType) console.log("Kategorije linija:", Object.fromEntries(Object.entries(descCount).sort((a, b) => b[1] - a[1]).slice(0, 25)));
  const trips = new Map();
  await read("trips.txt", (r) => {
    if (routeType && !routes.has(r.route_id)) return;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length) trips.set(r.trip_id, { ...r, runs, stops: [] });
  }, routeType ? { col: "route_id", keep: (id) => routes.has(id) } : null);
  console.log(`Vožnji u izabranim danima: ${trips.size}`);

  // 3) Stanice po vožnji (najveći fajl – čita se kao stream; redovi drugih vožnji se preskaču bez raščlanjivanja)
  await read("stop_times.txt", (r) => {
    const t = trips.get(r.trip_id);
    if (t) t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }, { col: "trip_id", keep: (id) => trips.has(id) });

  // 4) Vrsta voza i filtriranje
  const typeCount = {};
  const keep = [];
  for (const t of trips.values()) {
    if (!t.stops.length) continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const route = routes.get(t.route_id) || {};
    t.type = routeType ? route.type : detectType(productFromStopId(t.stops[0].id), route.route_short_name, route.route_long_name, route.route_desc);
    typeCount[t.type] = (typeCount[t.type] || 0) + 1;
    if (TYPES.includes(t.type) && !isShuttle(t, route) && servesCountry(t)) keep.push(t);
  }
  console.log("Prepoznate vrste vozova:", typeCount);

  const needStops = new Set(keep.flatMap((t) => t.stops.map((s) => s.id)));
  // Belgija: nazivi su u feedu na francuskom, holandski je u translations.txt -> naziv na lokalnom jeziku
  const dutch = new Map();
  if (COUNTRY === "be") await read("translations.txt", (r) => { if (r.table_name === "stops" && r.field_name === "stop_name" && r.language === "nl") dutch.set(r.field_value, r.translation); });
  const stopNames = new Map(), stopCoords = new Map(), stopPf = new Map(), stopSt = new Map();
  await read("stops.txt", (r) => {
    if (!needStops.has(r.stop_id)) return;
    const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
    const ok = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0); // 0,0 = coordinates missing in the feed (NL: Berlin Südkreuz)
    stopNames.set(r.stop_id, COUNTRY === "be" ? localName(r.stop_name, dutch.get(r.stop_name), ok ? lat : null, ok ? lon : null) : COUNTRY === "lu" ? luxStopName(r.stop_name) : r.stop_name);
    if (ok) stopCoords.set(r.stop_id, [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]);
    const pf = platformOf(r.stop_id, r.platform_code); // peron (Švajcarska, Belgija; SNCF ga ne objavljuje)
    if (pf) stopPf.set(r.stop_id, pf);
    // Holandija: šifra stanice (zone_id "IFF:asd"), po njoj se spajaju podaci uživo kad se promeni peron
    const st = COUNTRY === "nl" ? stationCode(r.zone_id) : null;
    if (st) stopSt.set(r.stop_id, st);
  });

  // 5) Redovi za bazu
  const rows = [];
  for (const t of keep) {
    const stops = t.stops.map((s) => {
      const c = stopCoords.get(s.id);
      const pf = stopPf.get(s.id), st = stopSt.get(s.id);
      return { ...s, name: stopNames.get(s.id) || s.id, time: hhmm(s.dep || s.arr), delay: 0, ...(c ? { lat: c[0], lon: c[1] } : {}), ...(pf ? { pf } : {}), ...(st ? { st } : {}) };
    });
    const first = stops[0], last = stops[stops.length - 1];
    for (const d of t.runs) {
      rows.push({
        id: `${d}_${CONFIG.idPrefix}${t.trip_id.replace(/^gt:nmbssncb:/, "")}`, // kraći id za Belgiju (bez "gt:nmbssncb:")
        trip_id: t.trip_id,
        service_date: d,
        country: COUNTRY,
        number: COUNTRY === "lu" ? luxNumber(t.trip_short_name || t.trip_id) : t.trip_short_name || t.trip_headsign || t.trip_id,
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
  if (!rows.length) throw new Error("Nijedan voz nije pronađen – baza nije menjana. Proveri ispis iznad (kategorije i vrste).");

  const db = supabaseRest();
  for (const part of chunks(rows, 500)) await db.upsert("trains", part);

  // Novi red vožnje može da promeni oznake vožnji (trip_id): brišemo stare redove za iste dane
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await db.select("trains", `select=id&country=eq.${COUNTRY}&service_date=eq.${d}&order=id&limit=1000&offset=${offset}`);
      old.push(...page.map((r) => r.id));
      if (page.length < 1000) break;
    }
    const stale = old.filter((id) => !fresh.has(id));
    for (const part of chunks(stale, 80)) {
      await db.del("trains", `id=in.(${encodeURIComponent(part.map((id) => `"${id.replaceAll('"', "")}"`).join(","))})`);
      removed += part.length;
    }
  }
  await db.del("trains", `country=eq.${COUNTRY}&service_date=lt.${addDays(TODAY, -8)}`); // istorija: 7 prethodnih dana (plaćeni pregled)
  console.log(`Gotovo: red vožnje je upisan (obrisano zastarelih: ${removed}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
