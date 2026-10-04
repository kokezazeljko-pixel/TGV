// GENERISANO iz source.mjs (bun build source.mjs --target=browser --format=esm --outfile index.ts) – ne menjati ručno.
// Auth: custom x-cron-token header checked against a Vault secret (verify_jwt is off on purpose).
// ../../../ingest/lib/gtfs-rt.mjs
function reader(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0, mul = 1;
    for (let i = 0;i < 7; i++) {
      if (pos >= buf.length)
        throw new Error("Protobuf: neočekivan kraj podataka");
      const b = buf[pos++];
      result += (b & 127) * mul;
      if (!(b & 128))
        return result;
      mul *= 128;
    }
    let big = BigInt(result), shift = 49n;
    for (;; ) {
      if (pos >= buf.length)
        throw new Error("Protobuf: neočekivan kraj podataka");
      const b = buf[pos++];
      big |= BigInt(b & 127) << shift;
      if (!(b & 128))
        return Number(BigInt.asIntN(64, big));
      shift += 7n;
    }
  };
  return {
    eof: () => pos >= buf.length,
    tag() {
      const t = varint();
      return { field: Math.floor(t / 8), wire: t & 7 };
    },
    varint,
    bytes() {
      const len = varint();
      const b = buf.subarray(pos, pos + len);
      pos += len;
      return b;
    },
    skip(wire) {
      if (wire === 0)
        varint();
      else if (wire === 1)
        pos += 8;
      else if (wire === 2) {
        const len = varint();
        pos += len;
      } else if (wire === 5)
        pos += 4;
      else
        throw new Error(`Protobuf: nepoznat wire tip ${wire}`);
    }
  };
}
var int = (v) => v;
var utf8 = new TextDecoder;
var str = (b) => utf8.decode(b);
function parse(buf, handlers, init) {
  const r = reader(buf);
  const obj = init();
  while (!r.eof()) {
    const { field, wire } = r.tag();
    const h = handlers[field];
    if (h && wire === h[0])
      h[1](obj, wire === 2 ? r.bytes() : r.varint());
    else
      r.skip(wire);
  }
  return obj;
}
var StopTimeEvent = (b) => parse(b, {
  1: [0, (o, v) => o.delay = int(v)],
  2: [0, (o, v) => o.time = int(v)]
}, () => ({}));
var StopTimeUpdate = (b) => parse(b, {
  1: [0, (o, v) => o.stopSequence = int(v)],
  2: [2, (o, v) => o.arrival = StopTimeEvent(v)],
  3: [2, (o, v) => o.departure = StopTimeEvent(v)],
  4: [2, (o, v) => o.stopId = str(v)],
  5: [0, (o, v) => o.scheduleRelationship = int(v)]
}, () => ({}));
var TripDescriptor = (b) => parse(b, {
  1: [2, (o, v) => o.tripId = str(v)],
  2: [2, (o, v) => o.startTime = str(v)],
  3: [2, (o, v) => o.startDate = str(v)],
  4: [0, (o, v) => o.scheduleRelationship = int(v)],
  5: [2, (o, v) => o.routeId = str(v)]
}, () => ({}));
var keepTrip = null;
var TripUpdate = (b) => {
  const raw = [];
  const o = parse(b, {
    1: [2, (o, v) => o.trip = TripDescriptor(v)],
    2: [2, (o, v) => raw.push(v)],
    4: [0, (o, v) => o.timestamp = int(v)],
    5: [0, (o, v) => o.delay = int(v)]
  }, () => ({ stopTimeUpdates: [] }));
  if (keepTrip && !keepTrip(o.trip))
    return null;
  o.stopTimeUpdates = raw.map(StopTimeUpdate);
  return o;
};
var Translation = (b) => parse(b, { 1: [2, (o, v) => o.text = str(v)], 2: [2, (o, v) => o.lang = str(v)] }, () => ({}));
var TranslatedString = (b) => parse(b, { 1: [2, (o, v) => o.t.push(Translation(v))] }, () => ({ t: [] })).t;
var TimeRange = (b) => parse(b, { 1: [0, (o, v) => o.start = int(v)], 2: [0, (o, v) => o.end = int(v)] }, () => ({}));
var EntitySelector = (b) => parse(b, {
  1: [2, (o, v) => o.agencyId = str(v)],
  2: [2, (o, v) => o.routeId = str(v)],
  3: [0, (o, v) => o.routeType = int(v)],
  4: [2, (o, v) => o.trip = TripDescriptor(v)],
  5: [2, (o, v) => o.stopId = str(v)]
}, () => ({}));
var Alert = (b) => parse(b, {
  1: [2, (o, v) => o.activePeriods.push(TimeRange(v))],
  5: [2, (o, v) => o.informed.push(EntitySelector(v))],
  6: [0, (o, v) => o.cause = int(v)],
  7: [0, (o, v) => o.effect = int(v)],
  8: [2, (o, v) => o.url = TranslatedString(v)],
  10: [2, (o, v) => o.header = TranslatedString(v)],
  11: [2, (o, v) => o.description = TranslatedString(v)]
}, () => ({ activePeriods: [], informed: [] }));
var FeedEntity = (b) => parse(b, {
  1: [2, (o, v) => o.id = str(v)],
  2: [0, (o, v) => o.isDeleted = v !== 0],
  3: [2, (o, v) => {
    const tu = TripUpdate(v);
    if (tu)
      o.tripUpdate = tu;
  }],
  5: [2, (o, v) => o.alert = Alert(v)]
}, () => ({}));
var FeedHeader = (b) => parse(b, {
  1: [2, (o, v) => o.version = str(v)],
  3: [0, (o, v) => o.timestamp = int(v)]
}, () => ({}));
function decodeFeed(buf, keep = null) {
  keepTrip = keep;
  try {
    return parse(buf, {
      1: [2, (o, v) => o.header = FeedHeader(v)],
      2: [2, (o, v) => {
        const e = FeedEntity(v);
        if (e.tripUpdate || e.alert || !keep)
          o.entities.push(e);
      }]
    }, () => ({ header: {}, entities: [] }));
  } finally {
    keepTrip = null;
  }
}

// ../../../ingest/lib/util.mjs
var TZ = "Europe/Paris";
function tzOffsetMin(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}
function gtfsToEpoch(dateStr, hms) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, s = 0] = hms.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let off = tzOffsetMin(guess);
  off = tzOffsetMin(guess - off * 60000);
  return Math.round((guess - off * 60000) / 1000);
}

// ../../../ingest/lib/realtime.mjs
var SKIPPED = 1;
var CANCELED = 3;
function applyTripUpdate(row, tu, nowSec) {
  const stops = row.stops.map((s) => ({ ...s }));
  const bySeq = new Map, byId = new Map;
  for (const u of tu.stopTimeUpdates) {
    if (u.stopSequence != null)
      bySeq.set(u.stopSequence, u);
    if (u.stopId)
      byId.set(u.stopId, u);
  }
  const schedEpoch = (s) => gtfsToEpoch(row.service_date, s.arr || s.dep);
  let carry = tu.delay ?? null;
  let anyUpdate = carry != null;
  for (const s of stops) {
    const u = bySeq.get(s.seq) ?? byId.get(s.id);
    s.skipped = false;
    if (u) {
      if (u.scheduleRelationship === SKIPPED)
        s.skipped = true;
      const ev = u.arrival ?? u.departure;
      let sec = null;
      if (ev?.delay != null)
        sec = ev.delay;
      else if (ev?.time != null) {
        const ref = u.arrival ? s.arr || s.dep : s.dep || s.arr;
        sec = ev.time - gtfsToEpoch(row.service_date, ref);
      }
      if (sec != null) {
        carry = sec;
        anyUpdate = true;
      }
    }
    s.delay = Math.max(0, Math.round((carry ?? 0) / 60));
  }
  const allSkipped = stops.length > 0 && stops.every((s) => s.skipped);
  const cancelled = tu.trip?.scheduleRelationship === CANCELED || allSkipped;
  let delay = stops.length ? stops[stops.length - 1].delay : 0;
  for (const s of stops) {
    if (s.skipped)
      continue;
    if (schedEpoch(s) + s.delay * 60 >= nowSec) {
      delay = s.delay;
      break;
    }
  }
  return { id: row.id, delay_min: cancelled ? 0 : delay, cancelled, stops, anyUpdate };
}
function matchRow(index, trip) {
  if (!trip?.tripId)
    return null;
  const rows = index.get(trip.tripId);
  if (!rows?.length)
    return null;
  if (trip.startDate && /^\d{8}$/.test(trip.startDate)) {
    const d = `${trip.startDate.slice(0, 4)}-${trip.startDate.slice(4, 6)}-${trip.startDate.slice(6)}`;
    return rows.find((r) => r.service_date === d) ?? null;
  }
  return rows[rows.length - 1];
}

// ../../../ingest/lib/realtime-run.mjs
var FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates", headers: () => ({}) },
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-rt", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }) }
};
async function fetchFeed(country, swissKey) {
  const f = FEEDS[country];
  const res = await fetch(f.url, { headers: { "User-Agent": "train-punctuality-ingest/1.0", ...f.headers(swissKey) } });
  if (!res.ok)
    throw new Error(`Preuzimanje ${f.url} nije uspelo: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ../../../ingest/lib/alerts.mjs
var ALERT_FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts", headers: () => ({}), langs: ["fr", "en"] },
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-sa", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }), langs: ["de", "fr", "it", "en"] }
};
var lang2 = (l) => (l || "").toLowerCase().slice(0, 2);
var allLangs = (tr) => {
  const o = {};
  for (const t of tr || [])
    if (t.text && lang2(t.lang) && !o[lang2(t.lang)])
      o[lang2(t.lang)] = t.text;
  return o;
};
var origLang = (tr, country) => {
  const langs = (tr || []).map((t) => lang2(t.lang)).filter(Boolean);
  if (country === "fr")
    return langs.includes("fr") ? "fr" : langs[0] || "fr";
  return langs.find((l) => ["de", "fr", "it"].includes(l)) || langs[0] || "de";
};
var pick = (tr, langs) => {
  if (!tr?.length)
    return null;
  for (const l of langs) {
    const x = tr.find((t) => (t.lang || "").toLowerCase().startsWith(l));
    if (x?.text)
      return x.text;
  }
  return tr[0].text || null;
};
function alertRows(feed, country, nowSec) {
  const langs = ALERT_FEEDS[country].langs;
  const rows = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a || e.isDeleted)
      continue;
    const periods = a.activePeriods.length ? a.activePeriods : [{}];
    const live = periods.some((p) => (p.end == null || p.end === 0 || p.end > nowSec) && (p.start == null || p.start < nowSec + 36 * 3600));
    if (!live)
      continue;
    const trip_ids = [...new Set(a.informed.map((i) => i.trip?.tripId).filter(Boolean))];
    if (!trip_ids.length)
      continue;
    const p = periods.find((x) => x.start || x.end) || {};
    const orig = origLang(a.description?.length ? a.description : a.header, country);
    rows.push({
      id: e.id,
      orig_lang: orig,
      header_tr: allLangs(a.header),
      description_tr: allLangs(a.description),
      header: pick(a.header, [orig, ...langs]),
      description: pick(a.description, [orig, ...langs]),
      cause: a.cause ?? null,
      effect: a.effect ?? null,
      url: pick(a.url, langs),
      active_from: p.start ? new Date(p.start * 1000).toISOString() : null,
      active_to: p.end ? new Date(p.end * 1000).toISOString() : null,
      trip_ids
    });
  }
  return rows;
}
function alertStats(feed) {
  const s = { alerts: 0, withTrip: 0, withRoute: 0, withStop: 0 };
  for (const e of feed.entities) {
    if (!e.alert)
      continue;
    s.alerts++;
    if (e.alert.informed.some((i) => i.trip?.tripId))
      s.withTrip++;
    if (e.alert.informed.some((i) => i.routeId))
      s.withRoute++;
    if (e.alert.informed.some((i) => i.stopId))
      s.withStop++;
  }
  return s;
}

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
async function rpc(fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!res.ok)
    throw new Error(`${fn} -> ${res.status}: ${await res.text()}`);
  return res.json();
}
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const country = new URL(req.url).searchParams.get("country") || "fr";
  if (!FEEDS[country])
    return json({ error: "unknown country" }, 400);
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !await rpc("cron_token_ok", { t: token }))
    return json({ error: "forbidden" }, 403);
  const swissKey = Deno.env.get("SWISS_API_KEY") || "";
  if (country === "ch" && !swissKey)
    return json({ error: "SWISS_API_KEY is not set (Edge Functions → Secrets)" }, 500);
  if (new URL(req.url).searchParams.get("kind") === "alerts")
    return syncAlerts(country, Deno.env.get("SWISS_SA_API_KEY") || swissKey);
  try {
    const t0 = Date.now();
    const [rows, feedBuf] = await Promise.all([rpc("rt_candidates", { p_country: country }), fetchFeed(country, swissKey)]);
    const trains = rows.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, id, arr, dep, delay, skipped]) => ({ seq, id, arr, dep, delay, skipped })) }));
    const index = new Map;
    for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date))) {
      if (!index.has(r.trip_id))
        index.set(r.trip_id, []);
      index.get(r.trip_id).push(r);
    }
    const feed = decodeFeed(feedBuf, (trip) => !!trip?.tripId && index.has(trip.tripId));
    const now = Math.floor(Date.now() / 1000);
    const updates = [];
    for (const ent of feed.entities) {
      const tu = ent.tripUpdate;
      if (!tu || ent.isDeleted)
        continue;
      const row = matchRow(index, tu.trip);
      if (!row)
        continue;
      const res = applyTripUpdate(row, tu, now);
      updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, d: res.stops.map((s) => [s.delay, !!s.skipped]) });
    }
    let written = 0;
    for (let i = 0;i < updates.length; i += 400)
      written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
    const out = { country, candidates: trains.length, feedBytes: feedBuf.length, matched: updates.length, written, ms: Date.now() - t0 };
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
    if (!res.ok)
      return json({ country, kind: "alerts", error: `feed ${res.status}` }, 502);
    const feed = decodeFeed(new Uint8Array(await res.arrayBuffer()));
    const rows = alertRows(feed, country, Math.floor(Date.now() / 1000));
    let stored = 0;
    for (let i = 0;i < rows.length; i += 300)
      stored += await rpc("apply_alerts", { p_country: country, payload: rows.slice(i, i + 300) });
    const out = { country, kind: "alerts", ...alertStats(feed), linkedToTrips: rows.length, stored };
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ country, kind: "alerts", error: String(e) }, 500);
  }
}
