// GENERISANO iz source.mjs (bun build source.mjs --target=node --format=esm --external node:* --outfile index.ts) – ne menjati ručno.
// source.mjs
import { inflateRawSync } from "node:zlib";

// ../../../ingest/lib/csv.mjs
function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0;i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else
          q = false;
      } else
        cur += c;
    } else if (c === '"')
      q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else
      cur += c;
  }
  out.push(cur);
  return out;
}

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

// ../../../ingest/lib/germany.mjs
var offCache = new Map;
function fastEpoch(dateStr, hms) {
  let off = offCache.get(dateStr);
  if (off == null) {
    off = gtfsToEpoch(dateStr, "12:00:00") - Date.UTC(...dateStr.split("-").map((v, i) => i === 1 ? v - 1 : +v), 12) / 1000;
    offCache.set(dateStr, off);
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, sec = 0] = hms.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi, sec) / 1000 + off;
}
var DE_GTFS_URL = "https://download.gtfs.de/germany/fv_free/latest.zip";
var DE_TT_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/";
var DE_CATS = { ICE: "ICE", IC: "IC", EC: "EC", ECE: "EC", EN: "Night train", NJ: "Night train", RJ: "Railjet", RJX: "Railjet", TGV: "TGV", FLX: "FLX" };
var deCategory = (s = "") => DE_CATS[(String(s).trim().match(/^[A-Za-z]+/) || [""])[0].toUpperCase()] || null;
var DE_SKIP_AGENCIES = new Set(["1"]);
var deNorm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/hauptbahnhof/g, "hbf").replace(/\bbahnhof\b|\bbf\b/g, "").replace(/[^a-z0-9]+/g, "");
var DE_NAMES = { "Gesundbrunnen Bahnhof Badstr., Berlin": "Berlin Gesundbrunnen", "Spandau S+U Rathaus Spandau Position 2, Berlin": "Berlin-Spandau", "Wannsee Bahnhof (S), Berlin": "Berlin-Wannsee", "Flensburg, Flensburg": "Flensburg", "Hauptbahnhof A1": "Kiel Hbf" };
function deStopName(raw = "") {
  if (DE_NAMES[raw])
    return DE_NAMES[raw];
  let s = raw.trim().replace(/\s+Gl\.\s*[\d\-–]+[a-z]?$/i, "").replace(/\((Gr|S|CH|PL|F|fr|SLO|A|CZ|NL|B|DK)\)/g, "").replace(/^Bahnhof,\s*/, "").replace(/,\s*Hauptbahnhof$/, " Hbf");
  const m = /^(.+?) (?:S\+U |S |U )?(?:Bahnhof|Bhf)?\s*(?:\(S\))?, ([^,]+)$/.exec(s);
  if (m && !/Hbf$/.test(m[1]))
    s = `${m[2]} ${m[1]}`;
  return s.replace(/\s*\(([^)]+)\)\s*/g, " ($1) ").replace(/\s+/g, " ").trim();
}
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
      return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    return td.decode(f.method === 8 ? inflateRaw(data) : data);
  };
}
function rows(text) {
  if (!text)
    return [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const head = parseLine(lines[0]).map((h) => h.trim());
  const out = [];
  for (let i = 1;i < lines.length; i++) {
    if (!lines[i])
      continue;
    const v = parseLine(lines[i]);
    const r = {};
    for (let k = 0;k < head.length; k++)
      r[head[k]] = v[k] ?? "";
    out.push(r);
  }
  return out;
}
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function inRing(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1;i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
      c = !c;
  }
  return c;
}
var touchesGermany = (stops, ring) => !ring || new Set(stops.filter((s) => s.lat != null && inRing(ring, s.lon, s.lat)).map((s) => s.name)).size >= 2;
function buildGermanSchedule(zip, dates, inflateRaw, ring = null) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const active = new Map(dates.map((d) => [d, new Set]));
  for (const r of rows(read("calendar.txt")))
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1")
        active.get(d).add(r.service_id);
    }
  for (const r of rows(read("calendar_dates.txt")))
    for (const d of dates) {
      if (r.date !== ymd(d))
        continue;
      if (r.exception_type === "1")
        active.get(d).add(r.service_id);
      if (r.exception_type === "2")
        active.get(d).delete(r.service_id);
    }
  const routes = new Map;
  for (const r of rows(read("routes.txt"))) {
    const type = deCategory(r.route_short_name);
    if (type && String(r.route_type) === "2" && !DE_SKIP_AGENCIES.has(r.agency_id))
      routes.set(r.route_id, { type, line: r.route_short_name.trim() });
  }
  const trips = new Map;
  for (const r of rows(read("trips.txt"))) {
    const route = routes.get(r.route_id);
    if (!route)
      continue;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length)
      trips.set(r.trip_id, { ...route, id: r.trip_id, runs, stops: [] });
  }
  for (const r of rows(read("stop_times.txt"))) {
    const t = trips.get(r.trip_id);
    if (t)
      t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }
  const stops = new Map;
  for (const r of rows(read("stops.txt")))
    stops.set(r.stop_id, r);
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2)
      continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      const pf = (r.platform_code || "").trim();
      return {
        ...s,
        name: deStopName(r.stop_name) || s.id,
        time: hhmm(s.dep || s.arr),
        delay: 0,
        ...Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {},
        .../^[0-9]{1,3}[a-z]?$/i.test(pf) ? { pf: pf.toUpperCase() } : {}
      };
    });
    if (!touchesGermany(st, ring))
      continue;
    for (const d of t.runs)
      out.push({
        id: `${d}_de_${t.id}`,
        trip_id: t.id,
        service_date: d,
        country: "de",
        number: "",
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
var attrs = (s) => {
  const o = {};
  for (const m of s.matchAll(/([a-z]+)="([^"]*)"/g))
    o[m[1]] = m[2];
  return o;
};
var TAG = { tl: /<tl ([^>]*?)\/?>/, ar: /<ar ([^>]*?)\/?>/, dp: /<dp ([^>]*?)\/?>/ };
function parseTimetable(xml) {
  const out = [];
  const station = (/<timetable[^>]*station=['"]([^'"]*)['"]/.exec(xml) || [])[1] || null;
  for (const m of xml.matchAll(/<s id="([^"]+)"[^>]*>([\s\S]*?)<\/s>/g)) {
    const body = m[2];
    const ev = (tag) => {
      const e = TAG[tag].exec(body);
      return e ? attrs(e[1]) : null;
    };
    out.push({ sid: m[1], tl: ev("tl"), ar: ev("ar"), dp: ev("dp") });
  }
  return { station, stops: out };
}
function ttTime(s) {
  if (!s || s.length < 10)
    return null;
  const d = `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  return new Date(fastEpoch(d, `${s.slice(6, 8)}:${s.slice(8, 10)}:00`) * 1000).toISOString();
}
function germanUpdates(trains, plan, nowSec) {
  const idx = new Map;
  const put = (hub, kind, iso, p) => {
    const m = Math.round(Date.parse(iso) / 60000), k = `${hub}|${kind}`;
    let h = idx.get(k);
    if (!h)
      idx.set(k, h = new Map);
    (h.get(m) || h.set(m, []).get(m)).push(p);
  };
  for (const p of plan) {
    if (!deCategory(p.cat))
      continue;
    for (const hub of p.hubs || [p.hub]) {
      if (p.dp_pt)
        put(hub, "d", p.dp_pt, p);
      if (p.ar_pt)
        put(hub, "a", p.ar_pt, p);
    }
  }
  const numOf = (p) => p.num || `?${p.eva}|${p.dp_pt || p.ar_pt}`;
  const FUZZY = 5;
  function candidates(tr, hub, kind, min) {
    const h = idx.get(`${hub}|${kind}`);
    if (!h || min == null)
      return [];
    const out = [];
    const flix = tr.type === "FLX";
    for (let dt = -FUZZY;dt <= FUZZY; dt++)
      for (const p of h.get(min + dt) || []) {
        const isFlx = deCategory(p.cat) === "FLX";
        if (flix ? !(isFlx && tr.number && p.num === tr.number) : isFlx)
          continue;
        const same = deCategory(p.cat) === tr.type;
        if (dt === 0)
          out.push([p, same ? 3 : 1.5, true]);
        else if (same)
          out.push([p, 1 / (Math.abs(dt) + 1), false]);
      }
    return out;
  }
  const updates = [];
  for (const tr of trains) {
    const per = tr.stops.map((s, i) => {
      const hub = deNorm(s.name);
      const depMin = s.dep && i < tr.stops.length - 1 ? Math.round(fastEpoch(tr.service_date, s.dep) / 60) : null;
      const arrMin = s.arr && i > 0 ? Math.round(fastEpoch(tr.service_date, s.arr) / 60) : null;
      const c = [...candidates(tr, hub, "d", depMin), ...candidates(tr, hub, "a", arrMin)];
      const seen = new Map;
      for (const x of c) {
        const k = numOf(x[0]), cur = seen.get(k);
        if (!cur)
          seen.set(k, [x[0], x[1], x[2], x[1]]);
        else {
          cur[1] += x[1];
          cur[2] = cur[2] || x[2];
          if (x[1] > cur[3]) {
            cur[0] = x[0];
            cur[3] = x[1];
          }
        }
      }
      return [...seen.values()];
    });
    const score = new Map, exact = new Map, stopsHit = new Map;
    for (const c of per) {
      const sum = c.reduce((a, x) => a + x[1], 0);
      if (!sum)
        continue;
      for (const [p, w, ex] of c) {
        const k = numOf(p);
        score.set(k, (score.get(k) || 0) + w / sum);
        stopsHit.set(k, (stopsHit.get(k) || 0) + 1);
        if (ex)
          exact.set(k, (exact.get(k) || 0) + 1);
      }
    }
    const ranked = [...score].sort((a, b) => b[1] - a[1] || (exact.get(b[0]) || 0) - (exact.get(a[0]) || 0));
    const best = ranked[0];
    if (!best || !((exact.get(best[0]) || 0) >= 1 || (stopsHit.get(best[0]) || 0) >= 2))
      continue;
    const key = best[0];
    let carry = null, cancelledAll = true;
    const d = [];
    for (const [i, s] of tr.stops.entries()) {
      const mine = per[i].filter((x) => numOf(x[0]) === key).sort((a, b) => b[1] - a[1])[0];
      const p = mine && mine[0];
      let skipped = false, apf;
      if (p) {
        const sec = p.dp_ct && p.dp_pt ? (Date.parse(p.dp_ct) - Date.parse(p.dp_pt)) / 1000 : p.ar_ct && p.ar_pt ? (Date.parse(p.ar_ct) - Date.parse(p.ar_pt)) / 1000 : p.dp_pt || p.ar_pt ? 0 : null;
        if (sec != null)
          carry = sec;
        if (p.cs === "c")
          skipped = true;
        if (p.cp && p.cp !== (p.pp || s.pf))
          apf = p.cp;
      }
      if (!skipped)
        cancelledAll = false;
      const delay = Math.max(0, Math.round((carry ?? 0) / 60));
      d.push(apf ? [delay, skipped, apf] : [delay, skipped]);
    }
    const tie = ranked[1] && Math.abs(ranked[1][1] - best[1]) < 0.000000001;
    const number = tr.type === "FLX" ? null : tie ? "" : key.startsWith("?") ? null : key;
    let delay_min = d.length ? d[d.length - 1][0] : 0;
    for (let i = 0;i < tr.stops.length; i++) {
      const s = tr.stops[i];
      if (d[i][1])
        continue;
      if (fastEpoch(tr.service_date, s.arr || s.dep) + d[i][0] * 60 >= nowSec) {
        delay_min = d[i][0];
        break;
      }
    }
    const cancelled = cancelledAll && d.length > 0;
    updates.push({ id: tr.id, delay_min: cancelled ? 0 : delay_min, cancelled, d, number });
  }
  return updates;
}
var FLIX_GTFS_URL = "http://gtfs.gis.flix.tech/gtfs_generic_eu.zip";
var FLIX_CITY = { Cologne: "Köln", Hanover: "Hannover", Munich: "München", Nuremberg: "Nürnberg", Brunswick: "Braunschweig" };
function flixStopName(raw = "") {
  let s = raw.replace(/\s*\(FlixTrain\)\s*$/i, "").trim().replace(/\s+Central Station$/i, " Hbf");
  for (const [en, de] of Object.entries(FLIX_CITY))
    s = s.replace(new RegExp("^" + en + "\\b"), de);
  return s;
}
var flixNumber = (tripId = "") => (String(tripId).split("-")[1] || "").replace(/^0+(?=\d)/, "");
var two = (n) => String(n).padStart(2, "0");
var berlinParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
function buildFlixSchedule(files, dates) {
  const ymd = (iso) => iso.replaceAll("-", "");
  const active = new Map(dates.map((d) => [d, new Set]));
  for (const r of files.calendar)
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1")
        active.get(d).add(r.service_id);
    }
  for (const r of files.calendar_dates)
    for (const d of dates) {
      if (r.date !== ymd(d))
        continue;
      if (r.exception_type === "1")
        active.get(d).add(r.service_id);
      if (r.exception_type === "2")
        active.get(d).delete(r.service_id);
    }
  const trips = new Map;
  for (const r of files.trips) {
    if (!/^FLX\d/.test(r.route_id || ""))
      continue;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length)
      trips.set(r.trip_id, { id: r.trip_id, runs, stops: [] });
  }
  for (const r of files.stop_times) {
    const t = trips.get(r.trip_id);
    if (t)
      t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }
  const stops = new Map(files.stops.map((r) => [r.stop_id, r]));
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2)
      continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    for (const d of t.runs) {
      const utc = (hms) => {
        const [h, m, s = 0] = hms.split(":").map(Number);
        return Date.UTC(...d.split("-").map((v, i) => i === 1 ? v - 1 : +v), h, m, s);
      };
      const first = berlinParts(utc(t.stops[0].dep || t.stops[0].arr));
      const day = `${first.year}-${first.month}-${first.day}`;
      const local = (hms) => {
        if (!hms)
          return null;
        const ms = utc(hms), p = berlinParts(ms);
        const dayDiff = Math.round((Date.UTC(+p.year, p.month - 1, +p.day) - Date.UTC(+first.year, first.month - 1, +first.day)) / 86400000);
        return `${two(+p.hour + 24 * dayDiff)}:${p.minute}:${p.second}`;
      };
      const st = t.stops.map((s) => {
        const r = stops.get(s.id) || {};
        const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
        const arr = local(s.arr), dep = local(s.dep);
        return {
          seq: s.seq,
          id: s.id,
          arr,
          dep,
          name: flixStopName(r.stop_name || s.id),
          time: hhmm(dep || arr),
          delay: 0,
          ...Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}
        };
      });
      out.push({
        id: `${day}_de_${t.id}`,
        trip_id: t.id,
        service_date: day,
        country: "de",
        number: flixNumber(t.id),
        type: "FLX",
        origin: st[0].name,
        destination: st[st.length - 1].name,
        dep: hhmm(st[0].dep || st[0].arr),
        arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep),
        stops: st
      });
    }
  }
  return out;
}
// ../../../lib/network-de.json (only the outline of Germany is used)
var network_de_default = { land: [[[7.2,53.25],[7.05,53.6],[7.7,53.7],[8.1,53.55],[8.5,53.55],[8.7,53.87],[8.95,53.9],[8.85,54.13],[8.95,54.5],[8.6,54.9],[9.45,54.805],[9.95,54.75],[10.15,54.4],[10.8,54.3],[11.1,54.45],[10.85,53.95],[11.45,53.9],[12.1,54.18],[12.5,54.47],[13.15,54.4],[13.4,54.65],[13.75,54.25],[14.25,53.9],[14.4,53.3],[14.15,52.85],[14.6,52.6],[14.7,52.1],[14.95,51.45],[15.04,51.0],[14.8,50.85],[14.3,50.88],[13.85,50.73],[13.0,50.45],[12.25,50.25],[12.2,50.1],[12.5,49.7],[12.9,49.35],[13.4,48.95],[13.8,48.75],[13.45,48.57],[13.0,48.25],[12.75,48.13],[12.95,47.95],[13.0,47.75],[13.0,47.45],[12.75,47.68],[12.2,47.6],[11.6,47.58],[11.1,47.4],[10.45,47.55],[10.2,47.3],[9.75,47.55],[9.2,47.65],[8.87,47.66],[8.78,47.73],[8.65,47.8],[8.47,47.76],[8.55,47.62],[8.2,47.6],[7.6,47.58],[7.55,48.1],[7.8,48.6],[8.2,48.98],[7.6,49.08],[7.0,49.12],[7.03,49.19],[6.95,49.225],[6.86,49.22],[6.7,49.2],[6.37,49.46],[6.42,49.55],[6.5,49.71],[6.52,49.81],[6.42,49.81],[6.32,49.84],[6.24,49.9],[6.18,49.95],[6.13,50.05],[6.13,50.13],[6.13,50.18],[6.4,50.32],[6.18,50.55],[6.02,50.75],[6.08,50.92],[5.87,51.05],[6.08,51.17],[6.22,51.36],[6.22,51.51],[6.05,51.66],[5.95,51.81],[6.17,51.9],[6.4,51.83],[6.83,51.97],[6.7,52.03],[7.03,52.23],[7.07,52.39],[6.98,52.46],[6.7,52.49],[6.73,52.65],[7.07,52.84],[7.2,52.98],[7.21,53.18]]] };

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var DB_ID = Deno.env.get("DB_CLIENT_ID") || "";
var DB_KEY = Deno.env.get("DB_API_KEY") || "";
var UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
var PER_RUN = 10;
var PLAN_AHEAD = 18;
var PLAN_CALLS = 20;
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
var upsert = (table, rows, onConflict) => rows.length ? rest("POST", `${table}?on_conflict=${onConflict}`, rows, { Prefer: "resolution=merge-duplicates,return=minimal" }) : null;
async function tt(path, missing = "") {
  const res = await fetch(DE_TT_BASE + path, { headers: { ...UA, "DB-Client-Id": DB_ID, "DB-Api-Key": DB_KEY, Accept: "application/xml" } });
  if (res.status === 404)
    return missing;
  if (!res.ok)
    throw new Error(`timetables ${path.split("/")[0]} -> ${res.status}`);
  return res.text();
}
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function schedule() {
  const today = parisDate(0);
  const dates = [today, parisDate(1)];
  const res = await fetch(DE_GTFS_URL, { headers: UA });
  if (!res.ok)
    throw new Error(`gtfs.de -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildGermanSchedule(zip, dates, (d) => inflateRawSync(d), network_de_default.land[0]);
  for (let i = 0;i < rows.length; i += 400)
    await upsert("trains", rows.slice(i, i + 400).map(({ number, ...r }) => r), "id");
  const fresh = new Set(rows.map((r) => r.id));
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.de&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id) && !id.includes("_de_FLX"));
    for (let i = 0;i < stale.length; i += 80)
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
  }
  await rest("DELETE", `trains?country=eq.de&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  await rest("DELETE", `de_plan?day=lt.${parisDate(-1)}`, null, { Prefer: "return=minimal" });
  await rest("DELETE", `de_plan_hours?hour=lt.${new Date(Date.now() - 2 * 86400000).toISOString()}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length, bytes: zip.length };
}
async function hubEva(h) {
  if (h.eva)
    return h.eva;
  const xml = await tt(`station/${encodeURIComponent(h.name)}`);
  const all = [...xml.matchAll(/<station ([^>]*)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([a-z0-9]+)=['"]([^'"]*)['"]/gi)].map((x) => [x[1], x[2]])));
  const hit = all.find((s) => deNorm(s.name) === deNorm(h.name)) || all[0];
  const eva = hit?.eva || null;
  await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { eva, last_error: eva ? null : "station not found", ...eva ? {} : { last_fchg: new Date().toISOString() } }, { Prefer: "return=minimal" });
  return eva;
}
async function planHour(h, eva, hr) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(hr);
  const g = (t) => p.find((x) => x.type === t).value;
  const xml = await tt(`plan/${eva}/${g("year")}${g("month")}${g("day")}/${g("hour")}`, null);
  if (xml === null)
    return false;
  const { station, stops } = parseTimetable(xml);
  const rows = stops.filter((s) => s.tl && deCategory(s.tl.c)).map((s) => ({
    eva,
    sid: s.sid,
    day: parisDate(0, new Date(ttTime(s.dp?.pt || s.ar?.pt) || hr)),
    cat: s.tl.c,
    num: s.tl.n,
    ar_pt: ttTime(s.ar?.pt),
    dp_pt: ttTime(s.dp?.pt),
    pp: s.dp?.pp || s.ar?.pp || null
  }));
  await upsert("de_plan", rows, "eva,sid");
  await upsert("de_plan_hours", [{ eva, hour: hr.toISOString() }], "eva,hour");
  if (station && station !== h.station) {
    h.station = station;
    await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { station }, { Prefer: "return=minimal" });
  }
  return true;
}
async function pollHub(h, now) {
  const eva = await hubEva(h);
  if (!eva)
    return 0;
  const hours = [0, 1, 2].map((k) => new Date(Math.floor(now / 3600000) * 3600000 + k * 3600000));
  const have = new Set((await rest("GET", `de_plan_hours?eva=eq.${eva}&hour=gte.${hours[0].toISOString()}&select=hour`)).map((r) => Date.parse(r.hour)));
  let calls = 0;
  for (const hr of hours) {
    if (have.has(hr.getTime()))
      continue;
    calls++;
    if (!await planHour(h, eva, hr))
      break;
  }
  const known = new Map((await rest("GET", `de_plan?eva=eq.${eva}&day=gte.${parisDate(-1)}&select=sid,day,ar_ct,dp_ct,cp,cs`)).map((r) => [r.sid, r]));
  const xml = await tt(`fchg/${eva}`);
  calls++;
  const ms = (t) => t ? Date.parse(t) : null;
  const ch = parseTimetable(xml).stops.filter((s) => known.has(s.sid)).map((s) => ({
    eva,
    sid: s.sid,
    day: known.get(s.sid).day,
    ar_ct: ttTime(s.ar?.ct),
    dp_ct: ttTime(s.dp?.ct),
    cp: s.dp?.cp || s.ar?.cp || null,
    cs: (s.dp?.cs || s.ar?.cs) === "c" ? "c" : null,
    updated_at: new Date().toISOString()
  })).filter((r) => {
    const o = known.get(r.sid);
    return ms(o.ar_ct) !== ms(r.ar_ct) || ms(o.dp_ct) !== ms(r.dp_ct) || (o.cp || null) !== r.cp || (o.cs || null) !== r.cs;
  });
  for (let i = 0;i < ch.length; i += 500)
    await upsert("de_plan", ch.slice(i, i + 500), "eva,sid");
  await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  return calls;
}
async function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22;i >= 0; i--)
    if (dv.getUint32(i, true) === 101010256) {
      e = i;
      break;
    }
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let n = 0;n < count; n++) {
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return async (name, keep = null) => {
    const f = files[name];
    if (!f)
      return [];
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    let o = 0;
    const src = new ReadableStream({ pull(c) {
      if (o >= data.length)
        return c.close();
      c.enqueue(data.subarray(o, o + 65536));
      o += 65536;
    } }, { highWaterMark: 1 });
    const reader = (f.method === 8 ? src.pipeThrough(new DecompressionStream("deflate-raw")) : src).getReader();
    const td = new TextDecoder;
    let rest = "", head = null;
    const out = [];
    const line = (l) => {
      if (l.endsWith("\r"))
        l = l.slice(0, -1);
      if (!l)
        return;
      if (!head) {
        head = parseLine(l.replace(/^\uFEFF/, "")).map((h) => h.trim());
        return;
      }
      if (keep && !keep(l))
        return;
      const v = parseLine(l);
      const r = {};
      head.forEach((h, i) => r[h] = v[i] ?? "");
      out.push(r);
    };
    for (;; ) {
      const { value, done } = await reader.read();
      if (done)
        break;
      const parts = (rest + td.decode(value, { stream: true })).split(`
`);
      rest = parts.pop();
      for (const l of parts)
        line(l);
    }
    line(rest);
    return out;
  };
}
async function flix() {
  const dates = [parisDate(0), parisDate(1)];
  const res = await fetch(FLIX_GTFS_URL, { headers: UA });
  if (!res.ok)
    throw new Error(`flix gtfs -> ${res.status}`);
  const read = await zipEntries(new Uint8Array(await res.arrayBuffer()));
  const isFlx = (l) => l.startsWith("FLX") || l.startsWith('"FLX');
  const files = {
    trips: await read("trips.txt", isFlx),
    stop_times: await read("stop_times.txt", isFlx),
    calendar: await read("calendar.txt", isFlx),
    calendar_dates: await read("calendar_dates.txt", isFlx),
    stops: []
  };
  const need = new Set(files.stop_times.map((r) => r.stop_id));
  files.stops = await read("stops.txt", (l) => need.has(l.slice(0, l.indexOf(","))));
  const rows = buildFlixSchedule(files, dates);
  if (!rows.length)
    return { kind: "flix", trains: 0, note: "no FlixTrain found – nothing changed" };
  for (let i = 0;i < rows.length; i += 200)
    await upsert("trains", rows.slice(i, i + 200), "id");
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.de&service_date=eq.${d}&id=like.*_de_FLX*&limit=1000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0;i < stale.length; i += 80) {
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
      removed += Math.min(80, stale.length - i);
    }
  }
  return { kind: "flix", trains: rows.length, removed };
}
async function planAhead() {
  const t0 = Date.now();
  const hubs = (await rest("GET", "de_hubs?select=name,eva,station&eva=not.is.null&order=name")).filter((h) => h.eva);
  const first = Math.floor(Date.now() / 3600000) * 3600000;
  const have = new Set;
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `de_plan_hours?hour=gte.${new Date(first).toISOString()}&select=eva,hour&order=eva,hour&limit=1000&offset=${off}`);
    for (const r of page)
      have.add(`${r.eva}|${Date.parse(r.hour)}`);
    if (page.length < 1000)
      break;
  }
  const todo = [];
  for (let k = 0;k < PLAN_AHEAD; k++)
    for (const h of hubs)
      if (!have.has(`${h.eva}|${first + k * 3600000}`))
        todo.push([h, first + k * 3600000]);
  let calls = 0, fetched = 0;
  const unpublished = new Set, errors = [];
  for (const [h, ms] of todo) {
    if (calls >= PLAN_CALLS)
      break;
    if (unpublished.has(h.eva))
      continue;
    calls++;
    try {
      if (await planHour(h, h.eva, new Date(ms)))
        fetched++;
      else
        unpublished.add(h.eva);
    } catch (e) {
      errors.push(`${h.name}: ${String(e).slice(0, 120)}`);
      unpublished.add(h.eva);
    }
  }
  return { kind: "plan", missing: todo.length, calls, fetched, notYetPublished: unpublished.size, errors, ms: Date.now() - t0 };
}
async function realtime() {
  const t0 = Date.now();
  const hubs = await rest("GET", `de_hubs?select=name,eva,station,last_fchg&order=last_fchg.asc.nullsfirst&limit=${PER_RUN}`);
  let calls = 0;
  const errors = [];
  for (const h of hubs) {
    try {
      calls += await pollHub(h, Date.now());
    } catch (e) {
      errors.push(`${h.name}: ${String(e).slice(0, 120)}`);
      await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: String(e).slice(0, 200) }, { Prefer: "return=minimal" });
    }
  }
  const days = [parisDate(-1), parisDate(0), parisDate(1)];
  const evaName = new Map((await rest("GET", "de_hubs?select=name,eva,station&eva=not.is.null")).map((h) => [h.eva, [...new Set([deNorm(h.name), deNorm(h.station || "")].filter(Boolean))]]));
  const plan = [];
  const since = new Date(Date.now() - 12 * 3600000).toISOString();
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `de_plan?day=in.(${days.join(",")})&or=(dp_pt.gte.%22${since}%22,ar_pt.gte.%22${since}%22)&select=eva,cat,num,ar_pt,dp_pt,ar_ct,dp_ct,pp,cp,cs&order=eva,sid&limit=1000&offset=${off}`);
    for (const p of page)
      plan.push({ ...p, hubs: evaName.get(p.eva) || [] });
    if (page.length < 1000)
      break;
  }
  const now = Math.floor(Date.now() / 1000);
  const trains = [], ahead = new Set;
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `trains?country=eq.de&service_date=in.(${days.join(",")})&select=id,service_date,type,number,stops,delay_min&order=id&limit=1000&offset=${off}`);
    for (const r of page) {
      const st = r.stops || [];
      if (st.length < 2)
        continue;
      const a = fastEpoch(r.service_date, st[0].dep || st[0].arr), b = fastEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
      if (now >= a - 3 * 3600 && now <= b + 7200 + (r.delay_min || 0) * 60)
        trains.push(r);
      else if (!r.number && r.type !== "FLX" && a > now && a <= now + PLAN_AHEAD * 3600) {
        trains.push(r);
        ahead.add(r.id);
      }
    }
    if (page.length < 1000)
      break;
  }
  const updates = germanUpdates(trains, plan, now).filter((u) => !ahead.has(u.id) || u.number);
  let written = 0;
  for (let i = 0;i < updates.length; i += 300)
    written += await rest("POST", "rpc/apply_de_updates", { payload: updates.slice(i, i + 300) });
  return { kind: "rt", hubs: hubs.map((h) => h.name), calls, planRows: plan.length, candidates: trains.length, numbersAhead: updates.filter((u) => ahead.has(u.id)).length, written, errors, ms: Date.now() - t0 };
}
Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && await rest("POST", "rpc/cron_token_ok", { t: token });
  if (!ok)
    return json({ error: "forbidden" }, 403);
  if (!DB_ID || !DB_KEY)
    return json({ error: "DB_CLIENT_ID / DB_API_KEY not set" }, 500);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    const out = kind === "schedule" ? await schedule() : kind === "flix" ? await flix() : kind === "plan" ? await planAhead() : await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
