// GENERISANO iz source.mjs (bun build source.mjs --target=node --format=esm --external node:* --outfile index.ts) – ne menjati ručno.
// source.mjs
import { inflateRawSync } from "node:zlib";

// ../../../ingest/lib/util.mjs
var TZ = "Europe/Paris";
function parisDate(offsetDays = 0, now = new Date) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
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
var hhmm = (hms) => {
  if (!hms)
    return null;
  const [h, m] = hms.split(":").map(Number);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
var PLATFORM = /^(\d{1,3}[A-Z]{0,2}|[A-Z]\d{0,2})$/;
function platformOf(stopId = "", code = "") {
  const c = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (c && PLATFORM.test(c))
    return c;
  const m = String(stopId).match(/^gs:nmbssncb:\d{7}_(\w+)$/) || String(stopId).match(/^\d{7}:0:(\w+)$/);
  return m && PLATFORM.test(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
}

// ../../../ingest/lib/spain.mjs
var ES_STATIC_URL = "https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip";
var ES_TRAINS_URL = "https://gtfsrt.renfe.com/trip_updates_LD.pb";
var ES_TYPES = { AVE: "AVE", "AVE INT": "AVE", AVLO: "Avlo", ALVIA: "Alvia", INTERCITY: "Intercity", EUROMED: "Euromed", TRENCELTA: "Celta" };
var detectSpanishType = (route = {}) => String(route.route_type).trim() === "2" ? ES_TYPES[String(route.route_short_name || "").trim().toUpperCase()] || null : null;
var esNumber = (n = "") => String(n).trim().replace(/^0+(?=\d)/, "");
var esTrainKey = (tripId = "") => esNumber(String(tripId).slice(0, 5));
var ES_NAMES = { "Bilbao-Intermod. Abando Indalecio Prieto": "Bilbao-Abando", "Porto Campanha - O Porto Campaña": "Porto Campanhã" };
var ES_HONOURS = /-(Clara Campoamor|Almudena Grandes|Julio Anguita|Fernando Zóbel|Rosa Manzano|Daniel Castelao|Miguel Hernández|Los Llanos|Joaquín Sorolla)$/;
var esStopName = (raw = "") => {
  const name = raw.trim();
  return ES_NAMES[name] || name.replace(ES_HONOURS, "");
};
function unzip(buf, inflateRaw) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22;i >= Math.max(0, buf.length - 65557); i--)
    if (dv.getUint32(i, true) === 101010256) {
      e = i;
      break;
    }
  if (e < 0)
    throw new Error("not a zip file");
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  const td = new TextDecoder;
  for (let n = 0;n < count; n++) {
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[td.decode(buf.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return (name) => {
    const f = files[name];
    if (!f)
      return "";
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    return td.decode(f.method === 8 ? inflateRaw(data) : data);
  };
}
function eachLine(text, onRow, keep = null) {
  let start = 0, head = null;
  while (start < text.length) {
    let end = text.indexOf(`
`, start);
    if (end < 0)
      end = text.length;
    const line = text.slice(start, end).trimEnd();
    start = end + 1;
    if (!line)
      continue;
    if (!head) {
      head = line.replace(/^﻿/, "").split(",").map((h) => h.trim());
      continue;
    }
    if (keep && !keep(line.slice(0, line.indexOf(","))))
      continue;
    const v = line.split(",");
    const r = {};
    for (let k = 0;k < head.length; k++)
      r[head[k]] = (v[k] ?? "").trim();
    onRow(r);
  }
}
var pad2 = (t) => t ? t.length === 7 ? "0" + t : t : null;
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function buildSpanishSchedule(zip, dates, inflateRaw) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const routes = new Map;
  eachLine(read("routes.txt"), (r) => {
    const type = detectSpanishType(r);
    if (type)
      routes.set(r.route_id, type);
  });
  const active = new Map(dates.map((d) => [d, new Set]));
  eachLine(read("calendar.txt"), (r) => {
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1")
        active.get(d).add(r.service_id);
    }
  });
  eachLine(read("calendar_dates.txt"), (r) => {
    for (const d of dates) {
      if (r.date !== ymd(d))
        continue;
      if (r.exception_type === "1")
        active.get(d).add(r.service_id);
      if (r.exception_type === "2")
        active.get(d).delete(r.service_id);
    }
  });
  const trips = new Map;
  eachLine(read("trips.txt"), (r) => {
    const type = routes.get(r.route_id);
    if (!type)
      return;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length)
      trips.set(r.trip_id, { type, id: r.trip_id, number: esNumber(r.trip_short_name || r.trip_id.slice(0, 5)), runs, stops: [] });
  }, (id) => routes.has(id));
  eachLine(read("stop_times.txt"), (r) => {
    trips.get(r.trip_id).stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: pad2(r.arrival_time), dep: pad2(r.departure_time) });
  }, (id) => trips.has(id));
  const need = new Set;
  for (const t of trips.values())
    for (const s of t.stops)
      need.add(s.id);
  const stops = new Map;
  eachLine(read("stops.txt"), (r) => stops.set(r.stop_id, r), (id) => need.has(id));
  const best = new Map;
  for (const t of trips.values())
    for (const d of t.runs) {
      const k = `${d}|${t.number}`, cur = best.get(k);
      if (!cur || t.stops.length > cur.stops.length)
        best.set(k, t);
    }
  for (const t of trips.values())
    t.runs = t.runs.filter((d) => best.get(`${d}|${t.number}`) === t);
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2 || !t.runs.length)
      continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      return {
        ...s,
        name: esStopName(r.stop_name || s.id),
        time: hhmm(s.dep || s.arr),
        delay: 0,
        ...Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}
      };
    });
    for (const d of t.runs)
      out.push({
        id: `${d}_es_${t.id}`,
        trip_id: t.id,
        service_date: d,
        country: "es",
        number: t.number,
        type: t.type,
        origin: st[0].name,
        destination: st[st.length - 1].name,
        dep: hhmm(st[0].dep || st[0].arr),
        arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep),
        stops: st
      });
  }
  return out;
}

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
var OVapiStop = (b) => parse(b, {
  2: [2, (o, v) => o.track = str(v)],
  3: [2, (o, v) => o.actual = str(v)],
  4: [2, (o, v) => o.station = str(v)]
}, () => ({}));
var StopTimeUpdate = (b) => parse(b, {
  1: [0, (o, v) => o.stopSequence = int(v)],
  2: [2, (o, v) => o.arrival = StopTimeEvent(v)],
  3: [2, (o, v) => o.departure = StopTimeEvent(v)],
  4: [2, (o, v) => o.stopId = str(v)],
  5: [0, (o, v) => o.scheduleRelationship = int(v)],
  1003: [2, (o, v) => o.ovapi = OVapiStop(v)]
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

// ../../../ingest/lib/realtime.mjs
var SKIPPED = 1;
var CANCELED = 3;
function applyTripUpdate(row, tu, nowSec) {
  const stops = row.stops.map((s) => ({ ...s }));
  const bySeq = new Map, byId = new Map, byStation = new Map;
  for (const u of tu.stopTimeUpdates) {
    if (u.stopSequence != null)
      bySeq.set(u.stopSequence, u);
    if (u.stopId)
      byId.set(u.stopId, u);
    if (u.ovapi?.station)
      byStation.set(u.ovapi.station.toLowerCase(), u);
  }
  const schedEpoch = (s) => gtfsToEpoch(row.service_date, s.arr || s.dep);
  let carry = tu.delay ?? null;
  let anyUpdate = carry != null;
  for (const s of stops) {
    const u = bySeq.get(s.seq) ?? byId.get(s.id) ?? (s.st ? byStation.get(s.st) : undefined);
    s.skipped = false;
    delete s.apf;
    if (u) {
      const apf = u.ovapi?.actual ? platformOf("", u.ovapi.actual) : u.stopId && u.stopId !== s.id ? platformOf(u.stopId) : null;
      if (apf && apf !== s.pf)
        s.apf = apf;
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

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok)
    throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
var rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function schedule() {
  const dates = [parisDate(0), parisDate(1)];
  const res = await fetch(ES_STATIC_URL, { headers: UA });
  if (!res.ok)
    throw new Error(`renfe gtfs -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildSpanishSchedule(zip, dates, (d) => inflateRawSync(d));
  if (!rows.length)
    throw new Error("no trains found – nothing changed");
  for (let i = 0;i < rows.length; i += 400)
    await rest("POST", "trains?on_conflict=id", rows.slice(i, i + 400), { Prefer: "resolution=merge-duplicates,return=minimal" });
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.es&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0;i < stale.length; i += 80) {
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
      removed += Math.min(80, stale.length - i);
    }
  }
  await rest("DELETE", `trains?country=eq.es&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length, removed, bytes: zip.length };
}
async function realtime() {
  const t0 = Date.now();
  const [rows, feedRes] = await Promise.all([rpc("rt_candidates", { p_country: "es" }), fetch(ES_TRAINS_URL, { headers: UA })]);
  if (!feedRes.ok)
    throw new Error(`renfe gtfs-rt -> ${feedRes.status}`);
  const buf = new Uint8Array(await feedRes.arrayBuffer());
  const trains = rows.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, id, arr, dep, delay, skipped, pf, st]) => ({ seq, id, arr, dep, delay, skipped, pf, st })) }));
  const index = new Map;
  for (const r of trains.sort((a, b) => a.service_date.localeCompare(b.service_date)))
    index.set(esTrainKey(r.trip_id), r);
  const feed = decodeFeed(buf, (trip) => !!trip?.tripId && index.has(esTrainKey(trip.tripId)));
  const done = new Set;
  const now = Math.floor(Date.now() / 1000);
  const updates = [];
  for (const ent of feed.entities) {
    const tu = ent.tripUpdate;
    if (!tu || ent.isDeleted)
      continue;
    const row = index.get(esTrainKey(tu.trip.tripId));
    if (!row || done.has(row.id))
      continue;
    done.add(row.id);
    const res = applyTripUpdate(row, tu, now);
    updates.push({ id: res.id, delay_min: res.delay_min, cancelled: res.cancelled, d: res.stops.map((s) => [s.delay, !!s.skipped]) });
  }
  const inFeed = updates.length, cancelled = updates.filter((u) => u.cancelled).length;
  const seen = new Set(updates.map((u) => u.id));
  for (const r of trains) {
    if (seen.has(r.id))
      continue;
    const res = onTimeUpdate(r, now);
    if (res)
      updates.push({ id: res.id, delay_min: 0, cancelled: false, d: res.stops.map(() => [0, false]) });
  }
  let written = 0;
  for (let i = 0;i < updates.length; i += 400)
    written += await rpc("apply_rt_delays", { payload: updates.slice(i, i + 400) });
  return { kind: "rt", candidates: trains.length, feedBytes: buf.length, matched: inFeed, cancelled, onTime: updates.length - inFeed, written, ms: Date.now() - t0 };
}
Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !await rpc("cron_token_ok", { t: token }))
    return json({ error: "forbidden" }, 403);
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
