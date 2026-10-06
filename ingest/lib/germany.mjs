// Germany (long-distance trains): timetable from gtfs.de (free "Fernverkehr" GTFS, CC BY 4.0, built from DB data)
// and live changes from the DB Timetables API (DB API Marketplace, key needed, 60 calls/minute on the free plan).
// The free GTFS has no train numbers, so trains get their number from DB Timetables at the main stations,
// matched by station + planned time + category.
import { parseLine } from "./csv.mjs";
import { gtfsToEpoch, hhmm } from "./util.mjs";

// gtfsToEpoch asks Intl for the time zone twice per call, which is slow for thousands of stops (edge functions have
// a small CPU budget): the offset is taken once per day (at noon) and reused.
const offCache = new Map();
export function fastEpoch(dateStr, hms) {
  let off = offCache.get(dateStr);
  if (off == null) { off = gtfsToEpoch(dateStr, "12:00:00") - Date.UTC(...dateStr.split("-").map((v, i) => (i === 1 ? v - 1 : +v)), 12) / 1000; offCache.set(dateStr, off); }
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, sec = 0] = hms.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi, sec) / 1000 + off;
}

export const DE_GTFS_URL = "https://download.gtfs.de/germany/fv_free/latest.zip";
export const DE_TT_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/";

// route_short_name ("ICE 23", "IC 55", "EC", "ECE 85", "EN", "RJ", "NJ") -> type shown on the site
const DE_CATS = { ICE: "ICE", IC: "IC", EC: "EC", ECE: "EC", EN: "Night train", NJ: "Night train", RJ: "Railjet", RJX: "Railjet", TGV: "TGV" };
export const deCategory = (s = "") => DE_CATS[(String(s).trim().match(/^[A-Za-z]+/) || [""])[0].toUpperCase()] || null;
export const DE_SKIP_AGENCIES = new Set(["1"]); // BahnTouristikExpress (special tourist trains)

// "Frankfurt(Main)Hbf" = "Frankfurt (Main) Hbf" = "Frankfurt (Main) Hauptbahnhof"
export const deNorm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/hauptbahnhof/g, "hbf").replace(/\bbahnhof\b|\bbf\b/g, "").replace(/[^a-z0-9]+/g, "");

// gtfs.de names mix DB short forms and bus-stop style names: "Hamburg-Altona(S)", "Emmerich(Gr)", "Bahnhof, Wittenberge",
// "Freiburg, Hauptbahnhof", "Gesundbrunnen Bahnhof Badstr., Berlin" -> "Hamburg-Altona", "Emmerich", "Wittenberge",
// "Freiburg Hbf", "Berlin Gesundbrunnen". DB-style brackets get a space: "Frankfurt(Main)Hbf" -> "Frankfurt (Main) Hbf".
const DE_NAMES = { "Gesundbrunnen Bahnhof Badstr., Berlin": "Berlin Gesundbrunnen", "Spandau S+U Rathaus Spandau Position 2, Berlin": "Berlin-Spandau", "Wannsee Bahnhof (S), Berlin": "Berlin-Wannsee", "Flensburg, Flensburg": "Flensburg", "Hauptbahnhof A1": "Kiel Hbf" };
export function deStopName(raw = "") {
  if (DE_NAMES[raw]) return DE_NAMES[raw];
  let s = raw.trim()
    .replace(/\((Gr|S|CH|PL|F|fr|SLO|A|CZ|NL|B|DK)\)/g, "")
    .replace(/^Bahnhof,\s*/, "")
    .replace(/,\s*Hauptbahnhof$/, " Hbf");
  const m = /^(.+?) (?:S\+U |S |U )?(?:Bahnhof|Bhf)?\s*(?:\(S\))?, ([^,]+)$/.exec(s); // "Ostbahnhof, Berlin" style
  if (m && !/Hbf$/.test(m[1])) s = `${m[2]} ${m[1]}`;
  return s.replace(/\s*\(([^)]+)\)\s*/g, " ($1) ").replace(/\s+/g, " ").trim();
}

// ---- minimal ZIP + CSV reading (works in Node and in Deno edge functions; inflateRaw is passed in)
function unzip(buf, inflateRaw) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("not a zip file");
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  const td = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[td.decode(buf.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return (name) => {
    const f = files[name]; if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    return td.decode(f.method === 8 ? inflateRaw(data) : data);
  };
}
function rows(text) {
  if (!text) return [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const head = parseLine(lines[0]).map((h) => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const v = parseLine(lines[i]); const r = {};
    for (let k = 0; k < head.length; k++) r[head[k]] = v[k] ?? "";
    out.push(r);
  }
  return out;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// zip (Uint8Array) -> rows for the trains table (country "de") for the given days (YYYY-MM-DD)
// gtfs.de also lists trains that run only abroad (Poland, Denmark, Austria, Switzerland...): only trains with at least
// two stations inside Germany are kept (ring = outline of Germany, [lon, lat] points, from lib/network-de.json)
function inRing(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const touchesGermany = (stops, ring) => !ring || new Set(stops.filter((s) => s.lat != null && inRing(ring, s.lon, s.lat)).map((s) => s.name)).size >= 2;

export function buildGermanSchedule(zip, dates, inflateRaw, ring = null) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const active = new Map(dates.map((d) => [d, new Set()]));
  for (const r of rows(read("calendar.txt"))) for (const d of dates) {
    const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
    if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1") active.get(d).add(r.service_id);
  }
  for (const r of rows(read("calendar_dates.txt"))) for (const d of dates) {
    if (r.date !== ymd(d)) continue;
    if (r.exception_type === "1") active.get(d).add(r.service_id);
    if (r.exception_type === "2") active.get(d).delete(r.service_id);
  }
  const routes = new Map();
  for (const r of rows(read("routes.txt"))) {
    const type = deCategory(r.route_short_name);
    if (type && String(r.route_type) === "2" && !DE_SKIP_AGENCIES.has(r.agency_id)) routes.set(r.route_id, { type, line: r.route_short_name.trim() });
  }
  const trips = new Map();
  for (const r of rows(read("trips.txt"))) {
    const route = routes.get(r.route_id); if (!route) continue;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length) trips.set(r.trip_id, { ...route, id: r.trip_id, runs, stops: [] });
  }
  for (const r of rows(read("stop_times.txt"))) {
    const t = trips.get(r.trip_id);
    if (t) t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }
  const stops = new Map();
  for (const r of rows(read("stops.txt"))) stops.set(r.stop_id, r);
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2) continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      const pf = (r.platform_code || "").trim();
      return { ...s, name: deStopName(r.stop_name) || s.id, time: hhmm(s.dep || s.arr), delay: 0,
        ...(Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}),
        ...(/^[0-9]{1,3}[a-z]?$/i.test(pf) ? { pf: pf.toUpperCase() } : {}) };
    });
    if (!touchesGermany(st, ring)) continue;
    for (const d of t.runs) out.push({
      id: `${d}_de_${t.id}`, trip_id: t.id, service_date: d, country: "de",
      number: "", type: t.type, origin: st[0].name, destination: st[st.length - 1].name,
      dep: hhmm(st[0].dep || st[0].arr), arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep), stops: st,
    });
  }
  return out;
}

// ---- DB Timetables XML (plan / fchg) -> stops. Times are "yyMMddHHmm" in German local time.
const attrs = (s) => { const o = {}; for (const m of s.matchAll(/([a-z]+)="([^"]*)"/g)) o[m[1]] = m[2]; return o; };
const TAG = { tl: /<tl ([^>]*?)\/?>/, ar: /<ar ([^>]*?)\/?>/, dp: /<dp ([^>]*?)\/?>/ };
export function parseTimetable(xml) {
  const out = [];
  const station = (/<timetable[^>]*station=['"]([^'"]*)['"]/.exec(xml) || [])[1] || null;
  for (const m of xml.matchAll(/<s id="([^"]+)"[^>]*>([\s\S]*?)<\/s>/g)) {
    const body = m[2];
    const ev = (tag) => { const e = TAG[tag].exec(body); return e ? attrs(e[1]) : null; };
    out.push({ sid: m[1], tl: ev("tl"), ar: ev("ar"), dp: ev("dp") });
  }
  return { station, stops: out };
}
export function ttTime(s) { // "2610052051" -> ISO timestamp (Europe/Berlin = Europe/Paris offsets)
  if (!s || s.length < 10) return null;
  const d = `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  return new Date(fastEpoch(d, `${s.slice(6, 8)}:${s.slice(8, 10)}:00`) * 1000).toISOString();
}

// ---- matching: trains (stops with name + arr/dep) + plan rows of the main stations -> live updates
// plan rows: { hubs: [normalized station names], cat, num, ar_pt, dp_pt, ar_ct, dp_ct, pp, cp, cs }
export function germanUpdates(trains, plan, nowSec) {
  const key = (hub, cat, iso) => `${hub}|${cat}|${iso ? Math.round(Date.parse(iso) / 60000) : ""}`;
  // gtfs.de and DB can name the category differently (EC / IC / RJ): the same station and minute without the category is the fallback
  const byKey = new Map();
  for (const p of plan) {
    const cat = deCategory(p.cat); if (!cat) continue;
    for (const hub of p.hubs || [p.hub]) for (const c of [cat, "*"]) {
      if (p.dp_pt) { const k = key(hub, c, p.dp_pt) + "|d"; if (c === cat || !byKey.has(k)) byKey.set(k, p); }
      if (p.ar_pt) { const k = key(hub, c, p.ar_pt) + "|a"; if (c === cat || !byKey.has(k)) byKey.set(k, p); }
    }
  }
  const updates = [];
  for (const tr of trains) {
    let carry = null, any = false, number = null, cancelledAll = true;
    const d = [];
    for (const s of tr.stops) {
      const hub = deNorm(s.name);
      const depMin = s.dep ? Math.round(fastEpoch(tr.service_date, s.dep) / 60) : null;
      const arrMin = s.arr ? Math.round(fastEpoch(tr.service_date, s.arr) / 60) : null;
      const p = (depMin && byKey.get(`${hub}|${tr.type}|${depMin}|d`)) || (arrMin && byKey.get(`${hub}|${tr.type}|${arrMin}|a`))
        || (depMin && byKey.get(`${hub}|*|${depMin}|d`)) || (arrMin && byKey.get(`${hub}|*|${arrMin}|a`));
      let skipped = false, apf;
      if (p) {
        any = true;
        if (p.num) number = p.num;
        const sec = p.dp_ct && p.dp_pt ? (Date.parse(p.dp_ct) - Date.parse(p.dp_pt)) / 1000 : p.ar_ct && p.ar_pt ? (Date.parse(p.ar_ct) - Date.parse(p.ar_pt)) / 1000 : (p.dp_pt || p.ar_pt) ? 0 : null;
        if (sec != null) carry = sec;
        if (p.cs === "c") skipped = true;
        if (p.cp && p.cp !== (p.pp || s.pf)) apf = p.cp;
      }
      if (!skipped) cancelledAll = false;
      const delay = Math.max(0, Math.round((carry ?? 0) / 60));
      d.push(apf ? [delay, skipped, apf] : [delay, skipped]);
    }
    if (!any) continue;
    // current delay = at the next stop not reached yet
    let delay_min = d.length ? d[d.length - 1][0] : 0;
    for (let i = 0; i < tr.stops.length; i++) {
      const s = tr.stops[i]; if (d[i][1]) continue;
      if (fastEpoch(tr.service_date, s.arr || s.dep) + d[i][0] * 60 >= nowSec) { delay_min = d[i][0]; break; }
    }
    const cancelled = cancelledAll && d.length > 0;
    updates.push({ id: tr.id, delay_min: cancelled ? 0 : delay_min, cancelled, d, number });
  }
  return updates;
}
