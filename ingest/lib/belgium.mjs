// Belgium (SNCB/NMBS): official open data from https://data.belgianmobility.io (no key needed).
// Static GTFS (zip) and GTFS-RT as JSON: trip updates (only trains that deviate from the timetable)
// and service alerts (FR/NL/DE/EN, linked to the network, not to single trains).
export const BE_BASE = "https://api-management-discovery-production.azure-api.net/api/gtfs/feed/nmbssncb";
export const BE_STATIC_URL = `${BE_BASE}/static`;
export const BE_TRIPS_URL = `${BE_BASE}/rt/trip-update`;
export const BE_ALERTS_URL = `${BE_BASE}/rt/alert`;

// Train category from routes.txt (route_short_name "IC", "IC 12", "EC", "NJ", "OTC", "L", "S12"…).
// Only intercity and international trains are kept (no L, S, P, tourist or replacement buses).
const BE_CATS = { IC: "IC", EC: "EC", NJ: "Night train", OTC: "EC" };
export function detectBelgianType(route = {}) {
  if (String(route.route_type) === "3") return null; // bus
  const p = ((route.route_short_name || "").match(/^[A-Za-z]+/) || [""])[0].toUpperCase();
  return BE_CATS[p] || null;
}

// A Belgian station has a UIC number starting with 88 (stop_id "gs:nmbssncb:8814001_14")
export const isBelgianStop = (stopId = "") => /(^|:)88\d{5}/.test(stopId);

// ---- Station names in the local official language
// The feed names stations in French (Anvers-Central, Louvain…) and gives Dutch in translations.txt.
// Flanders -> Dutch name, Wallonia -> French, Brussels (bilingual) -> "Bruxelles-Midi / Brussel-Zuid".
// Rough outline of Flanders as [lon, lat] (enough to tell the two language areas apart for stations).
const FLANDERS = [
  [2.54, 51.09], [3.37, 51.38], [4.24, 51.38], [4.40, 51.49], [5.04, 51.51], [5.86, 51.17], [5.80, 51.05], [5.76, 50.95],
  [5.69, 50.79], [5.55, 50.75], [5.30, 50.73], [5.10, 50.715], [4.98, 50.74], [4.85, 50.76], [4.65, 50.77], [4.48, 50.75],
  [4.30, 50.725], [4.15, 50.70], [3.95, 50.72], [3.85, 50.735], [3.70, 50.73], [3.58, 50.72], [3.45, 50.755], [3.30, 50.775],
  [3.18, 50.765], [3.05, 50.80], [2.86, 50.815], [2.63, 50.81],
];
function inside(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inBrussels = (lat, lon) => lat > 50.795 && lat < 50.915 && lon > 4.25 && lon < 4.48;
export function localName(fr, nl, lat, lon) {
  if (!nl || nl === fr || lat == null || lon == null) return fr || nl;
  if (inBrussels(lat, lon)) return `${fr} / ${nl}`;
  return inside(FLANDERS, lon, lat) ? nl : fr;
}

// ---- GTFS-RT as JSON -> the same shape as decodeFeed() in gtfs-rt.mjs
const REL = { SCHEDULED: 0, SKIPPED: 1, NO_DATA: 2, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, CANCELLED: 3 };
const num = (v) => (v == null || v === "" ? undefined : Number(v));
const rel = (v) => (v == null ? undefined : typeof v === "number" ? v : REL[String(v).toUpperCase()] ?? Number(v));
const tr = (x) => (x?.translation || []).map((t) => ({ text: t.text, lang: t.language }));
const ev = (e) => (e ? { delay: num(e.delay), time: num(e.time) } : undefined);
const trip = (t) => (t ? { tripId: t.tripId, startTime: t.startTime, startDate: t.startDate, scheduleRelationship: rel(t.scheduleRelationship), routeId: t.routeId } : undefined);

export function feedFromJson(json, keep = null) {
  const entities = [];
  for (const e of json?.entity || []) {
    const out = { id: e.id, isDeleted: !!e.isDeleted };
    if (e.tripUpdate) {
      const t = trip(e.tripUpdate.trip);
      if (keep && !keep(t)) continue;
      out.tripUpdate = {
        trip: t, delay: num(e.tripUpdate.delay), timestamp: num(e.tripUpdate.timestamp),
        stopTimeUpdates: (e.tripUpdate.stopTimeUpdate || []).map((u) => ({
          stopSequence: num(u.stopSequence), stopId: u.stopId, arrival: ev(u.arrival), departure: ev(u.departure), scheduleRelationship: rel(u.scheduleRelationship),
        })),
      };
    }
    if (e.alert) {
      const a = e.alert;
      out.alert = {
        activePeriods: (a.activePeriod || []).map((p) => ({ start: num(p.start), end: num(p.end) })),
        informed: (a.informedEntity || []).map((i) => ({ agencyId: i.agencyId, routeId: i.routeId, stopId: i.stopId, trip: trip(i.trip) })),
        cause: num(a.cause), effect: num(a.effect), url: tr(a.url), header: tr(a.headerText), description: tr(a.descriptionText),
      };
    }
    if (out.tripUpdate || out.alert) entities.push(out);
  }
  return { header: json?.header || {}, entities };
}

// ---- Alerts: SNCB links them to the whole network, so we find the trains by the stations in the title
// ("Namur - Huy : Aucun train", "Namen - Hoei: Geen treinen", "Namen / Namur - Hoei / Huy: Keine Züge").
const placeParts = (text = "") => text.split(":")[0].split(/\s+-\s+|\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length >= 3 && /[A-Za-zÀ-ÿ]/.test(s));
export function alertStations(header = []) {
  const names = new Set();
  for (const t of header) for (const p of placeParts(t.text)) names.add(p.toLowerCase());
  const fr = header.find((t) => (t.lang || "").startsWith("fr")) || header[0];
  const places = fr ? fr.text.split(":")[0].split(/\s+-\s+/).filter((s) => s.trim().length >= 3).length : 0;
  return { stations: [...names], need: Math.min(2, Math.max(1, places)) };
}

const lang2 = (l) => (l || "").toLowerCase().slice(0, 2);
const allLangs = (t) => { const o = {}; for (const x of t || []) if (x.text && lang2(x.lang) && !o[lang2(x.lang)]) o[lang2(x.lang)] = x.text; return o; };
const pick = (t, langs) => { for (const l of langs) { const x = (t || []).find((y) => lang2(y.lang) === l); if (x?.text) return x.text; } return t?.[0]?.text || null; };

// rows for apply_alerts_stations (Belgium); French is listed first by SNCB, Dutch is equally official
export function belgianAlertRows(feed, nowSec) {
  const rows = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a || e.isDeleted) continue;
    const periods = a.activePeriods.length ? a.activePeriods : [{}];
    const live = periods.some((p) => (!p.end || p.end > nowSec) && (!p.start || p.start < nowSec + 36 * 3600));
    if (!live) continue;
    const { stations, need } = alertStations(a.header);
    if (!stations.length) continue;
    const p = periods.find((x) => x.start || x.end) || {};
    rows.push({
      id: e.id, orig_lang: "fr", header_tr: allLangs(a.header), description_tr: allLangs(a.description),
      header: pick(a.header, ["fr", "nl"]), description: pick(a.description, ["fr", "nl"]),
      cause: a.cause ?? null, effect: a.effect ?? null, url: pick(a.url, ["fr", "nl", "en"]),
      active_from: p.start ? new Date(p.start * 1000).toISOString() : null,
      active_to: p.end ? new Date(p.end * 1000).toISOString() : null,
      stations, need,
    });
  }
  return rows;
}
