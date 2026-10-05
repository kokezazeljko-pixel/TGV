// Spain (Renfe): official timetable of the high-speed and long-distance trains (GTFS "Alta Velocidad, Larga y
// Media Distancia", data.renfe.com, CC BY 4.0) and live delays from Renfe's GTFS-RT feed (no key needed).
// Renfe lists only trains that deviate from the timetable: a running train missing from the feed is on time.
import { hhmm } from "./util.mjs";

export const ES_STATIC_URL = "https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip";
export const ES_TRAINS_URL = "https://gtfsrt.renfe.com/trip_updates_LD.pb";

// routes.txt route_short_name -> type shown on the site. Left out: AVANT (short high-speed commuter trains),
// MD, REGIONAL, REG.EXP., PROXIMDAD (regional trains).
const ES_TYPES = { AVE: "AVE", "AVE INT": "AVE", AVLO: "Avlo", ALVIA: "Alvia", INTERCITY: "Intercity", EUROMED: "Euromed", TRENCELTA: "Celta" };
export const detectSpanishType = (route = {}) => String(route.route_type).trim() === "2" ? ES_TYPES[String(route.route_short_name || "").trim().toUpperCase()] || null : null;

// Train numbers come zero-padded ("02061")
export const esNumber = (n = "") => String(n).trim().replace(/^0+(?=\d)/, "");
// Trip ids are train number + variant + first day: "0206112026-10-04" = train 2061. Renfe often lists one train as
// several trips (the whole run and parts of it, e.g. Vigo–Barcelona and León–Barcelona), and the live feed can name
// any of them, so live data is matched by train number.
export const esTrainKey = (tripId = "") => esNumber(String(tripId).slice(0, 5));

// Long official names -> the names people use ("Madrid-Puerta de Atocha-Almudena Grandes" -> "Madrid-Puerta de Atocha")
const ES_NAMES = { "Bilbao-Intermod. Abando Indalecio Prieto": "Bilbao-Abando", "Porto Campanha - O Porto Campaña": "Porto Campanhã" };
const ES_HONOURS = /-(Clara Campoamor|Almudena Grandes|Julio Anguita|Fernando Zóbel|Rosa Manzano|Daniel Castelao|Miguel Hernández|Los Llanos|Joaquín Sorolla)$/;
export const esStopName = (raw = "") => { const name = raw.trim(); return ES_NAMES[name] || name.replace(ES_HONOURS, ""); };

// ---- minimal ZIP reading (Node and Deno; inflateRaw is passed in)
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
    const f = files[name]; if (!f) return "";
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    return td.decode(f.method === 8 ? inflateRaw(data) : data);
  };
}
// Renfe pads every line with spaces to a fixed width; no field is quoted. keep(firstField) skips unwanted lines cheaply.
function eachLine(text, onRow, keep = null) {
  let start = 0, head = null;
  while (start < text.length) {
    let end = text.indexOf("\n", start); if (end < 0) end = text.length;
    const line = text.slice(start, end).trimEnd();
    start = end + 1;
    if (!line) continue;
    if (!head) { head = line.replace(/^﻿/, "").split(",").map((h) => h.trim()); continue; }
    if (keep && !keep(line.slice(0, line.indexOf(",")))) continue;
    const v = line.split(","); const r = {};
    for (let k = 0; k < head.length; k++) r[head[k]] = (v[k] ?? "").trim();
    onRow(r);
  }
}

const pad2 = (t) => (t ? (t.length === 7 ? "0" + t : t) : null); // "8:30:00" -> "08:30:00"
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// zip (Uint8Array) -> rows for the trains table (country "es") for the given days (YYYY-MM-DD)
export function buildSpanishSchedule(zip, dates, inflateRaw) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const routes = new Map();
  eachLine(read("routes.txt"), (r) => { const type = detectSpanishType(r); if (type) routes.set(r.route_id, type); });
  const active = new Map(dates.map((d) => [d, new Set()]));
  eachLine(read("calendar.txt"), (r) => {
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1") active.get(d).add(r.service_id);
    }
  });
  eachLine(read("calendar_dates.txt"), (r) => {
    for (const d of dates) {
      if (r.date !== ymd(d)) continue;
      if (r.exception_type === "1") active.get(d).add(r.service_id);
      if (r.exception_type === "2") active.get(d).delete(r.service_id);
    }
  });
  const trips = new Map();
  eachLine(read("trips.txt"), (r) => {
    const type = routes.get(r.route_id); if (!type) return;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length) trips.set(r.trip_id, { type, id: r.trip_id, number: esNumber(r.trip_short_name || r.trip_id.slice(0, 5)), runs, stops: [] });
  }, (id) => routes.has(id));
  eachLine(read("stop_times.txt"), (r) => {
    trips.get(r.trip_id).stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: pad2(r.arrival_time), dep: pad2(r.departure_time) });
  }, (id) => trips.has(id));
  const need = new Set(); for (const t of trips.values()) for (const s of t.stops) need.add(s.id);
  const stops = new Map();
  eachLine(read("stops.txt"), (r) => stops.set(r.stop_id, r), (id) => need.has(id));
  // one train per number and day: the trip with the most stops (the whole run)
  const best = new Map();
  for (const t of trips.values()) for (const d of t.runs) {
    const k = `${d}|${t.number}`, cur = best.get(k);
    if (!cur || t.stops.length > cur.stops.length) best.set(k, t);
  }
  for (const t of trips.values()) t.runs = t.runs.filter((d) => best.get(`${d}|${t.number}`) === t);
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2 || !t.runs.length) continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      return { ...s, name: esStopName(r.stop_name || s.id), time: hhmm(s.dep || s.arr), delay: 0,
        ...(Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}) };
    });
    for (const d of t.runs) out.push({
      id: `${d}_es_${t.id}`, trip_id: t.id, service_date: d, country: "es",
      number: t.number, type: t.type, origin: st[0].name, destination: st[st.length - 1].name,
      dep: hhmm(st[0].dep || st[0].arr), arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep), stops: st,
    });
  }
  return out;
}
