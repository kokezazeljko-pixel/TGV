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
function onTimeUpdate(row, nowSec) {
  const st = (row.stops || []).filter((s) => s.arr || s.dep);
  if (st.length < 2)
    return null;
  const first = gtfsToEpoch(row.service_date, st[0].dep || st[0].arr);
  const last = gtfsToEpoch(row.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
  if (nowSec < first || nowSec > last + (row.delay_min || 0) * 60)
    return null;
  return { id: row.id, delay_min: 0, cancelled: false, stops: row.stops.map((s) => ({ ...s, delay: 0, skipped: false })) };
}

// ../../../ingest/lib/belgium.mjs
var BE_BASE = "https://api-management-discovery-production.azure-api.net/api/gtfs/feed/nmbssncb";
var BE_STATIC_URL = `${BE_BASE}/static`;
var BE_TRIPS_URL = `${BE_BASE}/rt/trip-update`;
var BE_ALERTS_URL = `${BE_BASE}/rt/alert`;
var REL = { SCHEDULED: 0, SKIPPED: 1, NO_DATA: 2, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, CANCELLED: 3 };
var num = (v) => v == null || v === "" ? undefined : Number(v);
var rel = (v) => v == null ? undefined : typeof v === "number" ? v : REL[String(v).toUpperCase()] ?? Number(v);
var tr = (x) => (x?.translation || []).map((t) => ({ text: t.text, lang: t.language }));
var ev = (e) => e ? { delay: num(e.delay), time: num(e.time) } : undefined;
var trip = (t) => t ? { tripId: t.tripId, startTime: t.startTime, startDate: t.startDate, scheduleRelationship: rel(t.scheduleRelationship), routeId: t.routeId } : undefined;
function feedFromJson(json, keep = null) {
  const entities = [];
  for (const e of json?.entity || []) {
    const out = { id: e.id, isDeleted: !!e.isDeleted };
    if (e.tripUpdate) {
      const t = trip(e.tripUpdate.trip);
      if (keep && !keep(t))
        continue;
      out.tripUpdate = {
        trip: t,
        delay: num(e.tripUpdate.delay),
        timestamp: num(e.tripUpdate.timestamp),
        stopTimeUpdates: (e.tripUpdate.stopTimeUpdate || []).map((u) => ({
          stopSequence: num(u.stopSequence),
          stopId: u.stopId,
          arrival: ev(u.arrival),
          departure: ev(u.departure),
          scheduleRelationship: rel(u.scheduleRelationship)
        }))
      };
    }
    if (e.alert) {
      const a = e.alert;
      out.alert = {
        activePeriods: (a.activePeriod || []).map((p) => ({ start: num(p.start), end: num(p.end) })),
        informed: (a.informedEntity || []).map((i) => ({ agencyId: i.agencyId, routeId: i.routeId, stopId: i.stopId, trip: trip(i.trip) })),
        cause: num(a.cause),
        effect: num(a.effect),
        url: tr(a.url),
        header: tr(a.headerText),
        description: tr(a.descriptionText)
      };
    }
    if (out.tripUpdate || out.alert)
      entities.push(out);
  }
  return { header: json?.header || {}, entities };
}
var placeParts = (text = "") => text.split(":")[0].split(/\s+-\s+|\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length >= 3 && /[A-Za-zÀ-ÿ]/.test(s));
function alertStations(header = []) {
  const names = new Set;
  for (const t of header)
    for (const p of placeParts(t.text))
      names.add(p.toLowerCase());
  const fr = header.find((t) => (t.lang || "").startsWith("fr")) || header[0];
  const places = fr ? fr.text.split(":")[0].split(/\s+-\s+/).filter((s) => s.trim().length >= 3).length : 0;
  return { stations: [...names], need: Math.min(2, Math.max(1, places)) };
}
var lang2 = (l) => (l || "").toLowerCase().slice(0, 2);
var allLangs = (t) => {
  const o = {};
  for (const x of t || [])
    if (x.text && lang2(x.lang) && !o[lang2(x.lang)])
      o[lang2(x.lang)] = x.text;
  return o;
};
var pick = (t, langs) => {
  for (const l of langs) {
    const x = (t || []).find((y) => lang2(y.lang) === l);
    if (x?.text)
      return x.text;
  }
  return t?.[0]?.text || null;
};
var iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function worksDays(text = "", todayIso) {
  const [ty, tm] = todayIso.split("-").map(Number);
  const year = (m) => m < tm - 6 ? ty + 1 : m > tm + 6 ? ty - 1 : ty;
  const days = new Set;
  const addRange = (d1, m1, d2, m2) => {
    let t = Date.UTC(year(m1), m1 - 1, d1), end = Date.UTC(year(m2), m2 - 1, d2);
    if (end < t)
      end = Date.UTC(year(m2) + 1, m2 - 1, d2);
    for (let i = 0;t <= end && i < 120; t += 86400000, i++) {
      const x = new Date(t);
      days.add(iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()));
    }
  };
  let rest = text.replace(/(\d{1,2})\/(\d{1,2})\s*(?:-|to|au|tot|bis)\s*(\d{1,2})\/(\d{1,2})/gi, (_, a, b, c, d) => {
    addRange(+a, +b, +c, +d);
    return " ";
  });
  rest.replace(/((?:\d{1,2}(?:\s*(?:-|to)\s*\d{1,2})?(?:\s*,\s*|\s+and\s+))*\d{1,2}(?:\s*(?:-|to)\s*\d{1,2})?)\/(\d{1,2})\b/gi, (_, list, mo) => {
    const m = +mo;
    if (m < 1 || m > 12)
      return "";
    for (const part of list.split(/\s*,\s*|\s+and\s+/)) {
      const r = part.split(/\s*(?:-|to)\s*/).map(Number);
      if (r.every((d) => d >= 1 && d <= 31))
        addRange(r[0], m, r[r.length - 1], m);
    }
    return "";
  });
  let out = [...days].sort();
  if (/\bweekdays\b|\bwerkdagen\b|en semaine/i.test(text))
    out = out.filter((d) => ![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()));
  return out.length ? out : null;
}
function belgianAlertRows(feed, nowSec, todayIso) {
  const rows = [];
  const today = todayIso || new Date(nowSec * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a || e.isDeleted)
      continue;
    const periods = a.activePeriods.length ? a.activePeriods : [{}];
    const live = periods.some((p) => (!p.end || p.end > nowSec) && (!p.start || p.start < nowSec + 36 * 3600));
    if (!live)
      continue;
    const { stations, need } = alertStations(a.header);
    if (!stations.length)
      continue;
    let p = periods.find((x) => x.start || x.end) || {};
    if (a.cause === 10 && !p.start && !p.end) {
      const days = worksDays(pick(a.description, ["en", "fr"]) || "", today)?.filter((d) => d === today || d === tomorrow);
      if (!days?.length)
        continue;
      p = { start: Date.parse(days[0] + "T00:00:00+02:00") / 1000 + 3600, end: Date.parse(days[days.length - 1] + "T23:00:00+02:00") / 1000 };
    }
    rows.push({
      id: e.id,
      orig_lang: "fr",
      header_tr: allLangs(a.header),
      description_tr: allLangs(a.description),
      header: pick(a.header, ["fr", "nl"]),
      description: pick(a.description, ["fr", "nl"]),
      cause: a.cause ?? null,
      effect: a.effect ?? null,
      url: pick(a.url, ["fr", "nl", "en"]),
      active_from: p.start ? new Date(p.start * 1000).toISOString() : null,
      active_to: p.end ? new Date(p.end * 1000).toISOString() : null,
      stations,
      need
    });
  }
  return rows;
}

// ../../../ingest/lib/realtime-run.mjs
var FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates", headers: () => ({}) },
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-rt", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }) },
  be: { url: BE_TRIPS_URL, headers: () => ({ Accept: "application/json" }), json: true, onlyDeviations: true }
};
function readFeed(country, buf, keep) {
  if (FEEDS[country]?.json)
    return feedFromJson(JSON.parse(new TextDecoder().decode(buf)), keep);
  return decodeFeed(buf, keep);
}
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
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-sa", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }), langs: ["de", "fr", "it", "en"] },
  be: { url: BE_ALERTS_URL, headers: () => ({ Accept: "application/json" }), langs: ["fr", "nl", "de", "en"], json: true }
};
var lang22 = (l) => (l || "").toLowerCase().slice(0, 2);
var allLangs2 = (tr) => {
  const o = {};
  for (const t of tr || [])
    if (t.text && lang22(t.lang) && !o[lang22(t.lang)])
      o[lang22(t.lang)] = t.text;
  return o;
};
var origLang = (tr, country) => {
  const langs = (tr || []).map((t) => lang22(t.lang)).filter(Boolean);
  if (country === "fr")
    return langs.includes("fr") ? "fr" : langs[0] || "fr";
  return langs.find((l) => ["de", "fr", "it"].includes(l)) || langs[0] || "de";
};
var pick2 = (tr, langs) => {
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
      header_tr: allLangs2(a.header),
      description_tr: allLangs2(a.description),
      header: pick2(a.header, [orig, ...langs]),
      description: pick2(a.description, [orig, ...langs]),
      cause: a.cause ?? null,
      effect: a.effect ?? null,
      url: pick2(a.url, langs),
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
    const feed = readFeed(country, feedBuf, (trip) => !!trip?.tripId && index.has(trip.tripId));
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
    const inFeed = updates.length;
    if (FEEDS[country].onlyDeviations) {
      const seen = new Set(updates.map((u) => u.id));
      for (const r of trains) {
        if (seen.has(r.id))
          continue;
        const res = onTimeUpdate(r, now);
        if (res)
          updates.push({ id: res.id, delay_min: 0, cancelled: false, d: res.stops.map(() => [0, false]) });
      }
    }
    let written = 0;
    for (let i = 0;i < updates.length; i += 400)
      written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
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
    if (!res.ok)
      return json({ country, kind: "alerts", error: `feed ${res.status}` }, 502);
    const nowSec = Math.floor(Date.now() / 1000);
    const feed = f.json ? feedFromJson(await res.json()) : decodeFeed(new Uint8Array(await res.arrayBuffer()));
    const rows = country === "be" ? belgianAlertRows(feed, nowSec) : alertRows(feed, country, nowSec);
    const fn = country === "be" ? "apply_alerts_stations" : "apply_alerts";
    let stored = 0;
    for (let i = 0;i < rows.length; i += 300)
      stored += await rpc(fn, { p_country: country, payload: rows.slice(i, i + 300) });
    const out = { country, kind: "alerts", ...alertStats(feed), linkedToTrips: rows.length, stored };
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ country, kind: "alerts", error: String(e) }, 500);
  }
}
