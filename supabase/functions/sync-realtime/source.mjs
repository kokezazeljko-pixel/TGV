// Supabase Edge funkcija: osvežava kašnjenja za jednu zemlju (?country=fr, ch, be ili nl),
// a sa &kind=alerts zvanična obaveštenja prevoznika (GTFS-RT Service Alerts).
// Pokreće je pg_cron (vidi supabase/realtime-cron.sql) uz tajni žeton iz Vault-a.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u jedan fajl index.ts (bun build).
import { decodeFeed } from "../../../ingest/lib/gtfs-rt.mjs";
import { applyTripUpdate, lineKey, matchRow, matchRowLoose, matchRowSlot, onTimeUpdate, rowSlot, tripBase, tripSlot } from "../../../ingest/lib/realtime.mjs";
import { FEEDS, fetchFeed, readFeed } from "../../../ingest/lib/realtime-run.mjs";
import { ALERT_FEEDS, alertRows, alertStats } from "../../../ingest/lib/alerts.mjs";
import { feedFromJson, belgianAlertRows } from "../../../ingest/lib/belgium.mjs";

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function rpc(fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const country = new URL(req.url).searchParams.get("country") || "fr";
  if (!FEEDS[country]) return json({ error: "unknown country" }, 400);
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !(await rpc("cron_token_ok", { t: token }))) return json({ error: "forbidden" }, 403);

  const swissKey = Deno.env.get("SWISS_API_KEY") || "";
  if (country === "ch" && !swissKey) return json({ error: "SWISS_API_KEY is not set (Edge Functions → Secrets)" }, 500);

  if (new URL(req.url).searchParams.get("kind") === "alerts") {
    if (!ALERT_FEEDS[country]) return json({ country, kind: "alerts", error: "no official notices feed for this country" }, 400);
    return syncAlerts(country, Deno.env.get("SWISS_SA_API_KEY") || swissKey);
  }

  try {
    const t0 = Date.now();
    // Belgium: lines the feed never reports (refreshed daily); if this list cannot be read, the run goes on as before
    const quietQ = FEEDS[country].quietLines ? rpc("rt_quiet_lines_get", { p_country: country }).catch(() => null) : Promise.resolve(null);
    const [rows, feedBuf, quietList] = await Promise.all([rpc("rt_candidates_slim", { p_country: country, p_before: 3600, p_after: 3600 }), fetchFeed(country, swissKey), quietQ]);
    const quiet = new Set(Array.isArray(quietList) ? quietList : []);
    // compact stops [[seq, id, arr, dep, pf, st]] -> objects; trains until 1 hour after arrival (plus delay): less Supabase egress
    const trains = rows.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, id, arr, dep, pf, st]) => ({ seq, id, arr, dep, pf, st })) }));
    const index = new Map();
    for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date))) {
      if (!index.has(r.trip_id)) index.set(r.trip_id, []);
      index.get(r.trip_id).push(r);
    }
    // Belgium (looseIds): every feed train is read, so the log can show how many we could not match
    const loose = !!FEEDS[country].looseIds;
    const baseIndex = new Map();
    if (loose) for (const r of trains) { const b = tripBase(r.trip_id); if (b) { if (!baseIndex.has(b)) baseIndex.set(b, []); baseIndex.get(b).push(r); } }
    // Switzerland (slotIds): a trip whose id is not ours is still read when its slot (line + start time + date) is
    const slots = !!FEEDS[country].slotIds;
    const slotIndex = new Map();
    if (slots) for (const r of trains) { const k = rowSlot(r); if (k) { if (!slotIndex.has(k)) slotIndex.set(k, []); slotIndex.get(k).push(r); } }
    const feed = readFeed(country, feedBuf, loose ? null : (trip) => !!trip?.tripId && (index.has(trip.tripId) || (slots && slotIndex.has(tripSlot(trip.tripId, trip.startTime, trip.startDate)))));
    const now = Math.floor(Date.now() / 1000);
    const updates = [], used = new Set();
    // diag: unmatched trains of the kinds we keep (e.g. SNCB IC "007", EC "100"); local trains we do not keep are only counted
    const diag = { feedTrips: 0, exact: 0, byBase: 0, bySlot: 0, unmatched: 0, otherKinds: 0, examples: [] };
    const kind = (id) => String(id || "").split(":")[3] || "";
    const ourKinds = new Set(loose ? trains.map((r) => kind(r.trip_id)) : []);
    // exact ids first; the version-less fallback only for what is left, so it never takes an exactly matched train
    const pairs = [], rest = [];
    for (const ent of feed.entities) {
      const tu = ent.tripUpdate;
      if (!tu || ent.isDeleted) continue;
      diag.feedTrips++;
      const row = matchRow(index, tu.trip);
      if (row) { diag.exact++; used.add(row.id); pairs.push([row, tu]); } else rest.push(tu);
    }
    for (const tu of rest) {
      let row = loose ? matchRowLoose(baseIndex, tu.trip) : slots ? matchRowSlot(slotIndex, tu.trip) : null;
      if (row && used.has(row.id)) row = null;
      if (row) { if (loose) diag.byBase++; else diag.bySlot++; used.add(row.id); pairs.push([row, tu]); continue; }
      if (loose && !ourKinds.has(kind(tu.trip?.tripId))) { diag.otherKinds++; continue; }
      diag.unmatched++;
      if (diag.examples.length < 8) diag.examples.push(`${tu.trip?.tripId}|${tu.trip?.startDate || ""}`);
    }
    for (const [row, tu] of pairs) {
      const res = applyTripUpdate(row, tu, now);
      updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, d: res.stops.map((s) => (s.apf ? [s.delay, !!s.skipped, s.apf] : [s.delay, !!s.skipped])) });
    }
    const inFeed = updates.length;
    // Belgium: running trains missing from the feed are on time, except on lines the feed never reports
    let quietSkipped = 0;
    if (FEEDS[country].onlyDeviations) {
      const seen = new Set(updates.map((u) => u.id));
      for (const r of trains) {
        if (seen.has(r.id)) continue;
        if (quiet.has(lineKey(r.trip_id))) { quietSkipped++; continue; }
        const res = onTimeUpdate(r, now);
        if (res) updates.push({ id: res.id, delay_min: 0, cancelled: false, d: res.stops.map(() => [0, false]) });
      }
    }
    let written = 0;
    for (let i = 0; i < updates.length; i += 400) written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
    const out = { country, candidates: trains.length, feedBytes: feedBuf.length, matched: inFeed, onTime: updates.length - inFeed, written, ms: Date.now() - t0 };
    if (loose) out.diag = diag;
    if (slots) out.diag = { exact: diag.exact, bySlot: diag.bySlot };
    if (FEEDS[country].quietLines) { out.quietLines = Array.isArray(quietList) ? quiet.size : "unreadable"; out.quietSkipped = quietSkipped; }
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ country, error: String(e) }, 500);
  }
});

async function syncAlerts(country, swissKey) {
  try {
    const f = ALERT_FEEDS[country];
    const res = await fetch(f.url, { headers: { "User-Agent": "train-punctuality-ingest/1.0", ...f.headers(swissKey) } });
    if (!res.ok) return json({ country, kind: "alerts", error: `feed ${res.status}` }, 502);
    const nowSec = Math.floor(Date.now() / 1000);
    const feed = f.json ? feedFromJson(await res.json()) : decodeFeed(new Uint8Array(await res.arrayBuffer()));
    // Belgium links notices to the network, not to trains: they are matched by station names in the database
    const rows = country === "be" ? belgianAlertRows(feed, nowSec) : alertRows(feed, country, nowSec);
    const fn = country === "be" ? "apply_alerts_stations" : "apply_alerts";
    let stored = 0;
    for (let i = 0; i < rows.length; i += 300) stored += await rpc(fn, { p_country: country, payload: rows.slice(i, i + 300) });
    const out = { country, kind: "alerts", ...alertStats(feed), linkedToTrips: rows.length, stored };
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ country, kind: "alerts", error: String(e) }, 500);
  }
}
