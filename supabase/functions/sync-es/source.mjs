// Supabase Edge funkcija za Španiju (Renfe):
//   ?kind=schedule  red vožnje (AVE, Avlo, Alvia, Intercity, Euromed, Celta) za danas i sutra -> tabela trains (jednom dnevno)
//   ?kind=rt        kašnjenja iz Renfe GTFS-RT (svakog minuta). Renfe navodi samo vozove koji kasne ili su otkazani:
//                   voz koji vozi, a nije u feedu, je na vreme.
// Zaštita: x-cron-token (Vault) kao kod sync-realtime. Ključ nije potreban.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { inflateRawSync } from "node:zlib";
import { ES_STATIC_URL, ES_TRAINS_URL, buildSpanishSchedule, esTrainKey } from "../../../ingest/lib/spain.mjs";
import { decodeFeed } from "../../../ingest/lib/gtfs-rt.mjs";
import { applyTripUpdate, onTimeUpdate } from "../../../ingest/lib/realtime.mjs";
import { parisDate } from "../../../ingest/lib/util.mjs";

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function schedule() {
  const dates = [parisDate(0), parisDate(1)]; // Madrid i Pariz su u istoj vremenskoj zoni
  const res = await fetch(ES_STATIC_URL, { headers: UA });
  if (!res.ok) throw new Error(`renfe gtfs -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildSpanishSchedule(zip, dates, (d) => inflateRawSync(d));
  if (!rows.length) throw new Error("no trains found – nothing changed");
  // live data already written for these trains stays (only the timetable columns are sent)
  for (let i = 0; i < rows.length; i += 400) await rest("POST", "trains?on_conflict=id", rows.slice(i, i + 400), { Prefer: "resolution=merge-duplicates,return=minimal" });
  // a new timetable can rename trips: old rows of the same days are removed
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.es&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0; i < stale.length; i += 80) {
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
      removed += Math.min(80, stale.length - i);
    }
  }
  await rest("DELETE", `trains?country=eq.es&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" }); // 7 days of history
  return { kind: "schedule", trains: rows.length, removed, bytes: zip.length };
}

async function realtime() {
  const t0 = Date.now();
  const [rows, feedRes] = await Promise.all([rpc("rt_candidates", { p_country: "es" }), fetch(ES_TRAINS_URL, { headers: UA })]);
  if (!feedRes.ok) throw new Error(`renfe gtfs-rt -> ${feedRes.status}`);
  const buf = new Uint8Array(await feedRes.arrayBuffer());
  const trains = rows.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, id, arr, dep, delay, skipped, pf, st]) => ({ seq, id, arr, dep, delay, skipped, pf, st })) }));
  // by train number (see esTrainKey); a later day wins (yesterday's train has arrived by then)
  const index = new Map();
  for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date))) index.set(esTrainKey(r.trip_id), r);
  const feed = decodeFeed(buf, (trip) => !!trip?.tripId && index.has(esTrainKey(trip.tripId)));
  const done = new Set();
  const now = Math.floor(Date.now() / 1000);
  const updates = [];
  for (const ent of feed.entities) {
    const tu = ent.tripUpdate;
    if (!tu || ent.isDeleted) continue;
    const row = index.get(esTrainKey(tu.trip.tripId));
    if (!row || done.has(row.id)) continue;
    done.add(row.id);
    const res = applyTripUpdate(row, tu, now);
    updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, d: res.stops.map((s) => [s.delay, !!s.skipped]) });
  }
  const inFeed = updates.length, cancelled = updates.filter((u) => u.cancelled).length;
  const seen = new Set(updates.map((u) => u.id));
  for (const r of trains) {
    if (seen.has(r.id)) continue;
    const res = onTimeUpdate(r, now);
    if (res) updates.push({ id: res.id, delay_min: 0, cancelled: false, d: res.stops.map(() => [0, false]) });
  }
  let written = 0;
  for (let i = 0; i < updates.length; i += 400) written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
  return { kind: "rt", candidates: trains.length, feedBytes: buf.length, matched: inFeed, cancelled, onTime: updates.length - inFeed, written, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !(await rpc("cron_token_ok", { t: token }))) return json({ error: "forbidden" }, 403);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    const out = kind === "schedule" ? await schedule() : await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
