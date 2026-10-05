// Supabase Edge funkcija: osvežava kašnjenja za jednu zemlju (?country=fr, ch, be ili nl),
// a sa &kind=alerts zvanična obaveštenja prevoznika (GTFS-RT Service Alerts).
// Pokreće je pg_cron (vidi supabase/realtime-cron.sql) uz tajni žeton iz Vault-a.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u jedan fajl index.ts (bun build).
import { decodeFeed } from "../../../ingest/lib/gtfs-rt.mjs";
import { applyTripUpdate, matchRow, onTimeUpdate } from "../../../ingest/lib/realtime.mjs";
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
    const [rows, feedBuf] = await Promise.all([rpc("rt_candidates", { p_country: country }), fetchFeed(country, swissKey)]);
    // compact stops [[seq, id, arr, dep, delay, skipped]] -> objects
    const trains = rows.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, id, arr, dep, delay, skipped, pf, st]) => ({ seq, id, arr, dep, delay, skipped, pf, st })) }));
    const index = new Map();
    for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date))) {
      if (!index.has(r.trip_id)) index.set(r.trip_id, []);
      index.get(r.trip_id).push(r);
    }
    const feed = readFeed(country, feedBuf, (trip) => !!trip?.tripId && index.has(trip.tripId));
    const now = Math.floor(Date.now() / 1000);
    const updates = [];
    for (const ent of feed.entities) {
      const tu = ent.tripUpdate;
      if (!tu || ent.isDeleted) continue;
      const row = matchRow(index, tu.trip);
      if (!row) continue;
      const res = applyTripUpdate(row, tu, now);
      updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, d: res.stops.map((s) => (s.apf ? [s.delay, !!s.skipped, s.apf] : [s.delay, !!s.skipped])) });
    }
    const inFeed = updates.length;
    // Belgium: running trains missing from the feed are on time
    if (FEEDS[country].onlyDeviations) {
      const seen = new Set(updates.map((u) => u.id));
      for (const r of trains) {
        if (seen.has(r.id)) continue;
        const res = onTimeUpdate(r, now);
        if (res) updates.push({ id: res.id, delay_min: 0, cancelled: false, d: res.stops.map(() => [0, false]) });
      }
    }
    let written = 0;
    for (let i = 0; i < updates.length; i += 400) written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
    const out = { country, candidates: trains.length, feedBytes: feedBuf.length, matched: inFeed, onTime: updates.length - inFeed, written, ms: Date.now() - t0 };
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
