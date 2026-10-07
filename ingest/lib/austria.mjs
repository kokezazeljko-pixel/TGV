// Austria (ÖBB): timetable from the ÖBB GTFS (static.web.oebb.at, published once a year for the timetable period).
// The zip is ~170 MB, but almost all of it is shapes.txt: the files we need are read with HTTP range requests (~3 MB).

export const AT_GTFS_URL = "https://static.web.oebb.at/open-data/soll-fahrplan-gtfs/GTFS_Fahrplan_2026.zip";

// long-distance categories shown on the site (trip_short_name "RJX 765" -> type)
export const AT_CATS = { RJ: "Railjet", RJX: "Railjet", IC: "IC", EC: "EC", ECE: "EC", EN: "Night train", NJ: "Night train", D: "D", ICE: "ICE" };
export const atCategory = (s = "") => AT_CATS[(String(s).trim().match(/^[A-Za-z]+/) || [""])[0].toUpperCase()] || null;

// tariff points at the borders are timetable rows, but no train stops there
export const isTariffPoint = (name = "") => /Tarifpunkt|^TP\s/i.test(name);

const FIXED = {
  "Wien Hauptbahnhof Autoreisezug": "Wien Hbf",
  "Linz/Donau Hbf": "Linz Hbf",
  "Stuttgart Hauptbahnhof 1": "Stuttgart Hbf",
  "Bologna, Stazione di Bologna Centrale": "Bologna Centrale",
  "Roma, Stazione di Roma Tiburtina": "Roma Tiburtina",
  "Jesenice (SI) železniška posta": "Jesenice",
  "Bratislava hlavná stanica": "Bratislava hl. st.",
  "Brno hlavní nádraží": "Brno hl. n.",
  "Praha hlavní nádraží": "Praha hl. n.",
  "Děčín hlavní nádrazí": "Děčín hl. n.",
  "Kyjiw-Passaschyrskyj": "Kyiv-Pasazhyrskyi",
};
// "Neumarkt" and "St.Johann" exist twice in Austria: told apart by where they are
const TWINS = [
  ["Neumarkt", (lon) => (lon < 13.6 ? "Neumarkt am Wallersee" : "Neumarkt in der Steiermark")],
  ["St.Johann", () => "St. Johann im Pongau"],
];
export function atStopName(raw = "", lat = null, lon = null) {
  let s = raw.trim()
    .replace(/\s+(Bahnhof|Bahnhst|Haltestelle|Bf\.|Bhf\.)$/, "")
    .replace(/\s+Bahnhst\s+\(.*\)$/, "")
    .replace(/\s+S-Bahn$/, "")
    .replace(/\s+Hauptbahnhof$/, " Hbf");
  for (const [n, f] of TWINS) if (s === n) return f(lon);
  if (FIXED[s]) return FIXED[s];
  s = s.replace(/^([^,]+), Stazione di .*$/, "$1") // "Brennero, Stazione di Brennero"
    .replace(/\s+(stazione|železniška postaja|Železniška postaja|pályaudvar|stacja kolejowa|stanica|željeznički kolodvor)$/i, "")
    .replace(/\bSt\.(?=\S)/g, "St. ");
  return s;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const hhmm = (hms) => { if (!hms) return null; const [h, m] = hms.split(":").map(Number); return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
const mins = (hms) => { const [h, m] = hms.split(":").map(Number); return h * 60 + m; };
function inRing(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// platform rows without a parent row (some in Vorarlberg and Switzerland) are grouped by their station number
export const atParent = (r) => r.parent_station || ((g) => (g ? `P${g[1]}:${g[2]}:${g[3]}` : r.stop_id))(/^([a-z]{2}):(\d+):(\d+)/.exec(r.stop_id));

// files: { calendar, calendar_dates, routes, trips, stop_times, stops } as arrays of row objects
// (stop_times may already be limited to the trips of the long-distance categories).
// ÖBB cuts one run into pieces with the same number (Roma–Tarvisio, Tarvisio–Freilassing, Freilassing–München):
// pieces that continue at the same station within 90 minutes are joined into one train.
export function buildAustrianSchedule(files, dates, ring) {
  const ymd = (iso) => iso.replaceAll("-", "");
  const active = new Map(dates.map((d) => [d, new Set()]));
  for (const r of files.calendar) for (const d of dates) {
    const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
    if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1") active.get(d).add(r.service_id);
  }
  for (const r of files.calendar_dates) for (const d of dates) {
    if (r.date !== ymd(d)) continue;
    if (r.exception_type === "1") active.get(d).add(r.service_id);
    if (r.exception_type === "2") active.get(d).delete(r.service_id);
  }
  const rail = new Set(files.routes.filter((r) => String(r.route_type) === "2").map((r) => r.route_id));
  const trips = new Map();
  for (const r of files.trips) {
    if (!rail.has(r.route_id)) continue;
    const [c, n = ""] = (r.trip_short_name || "").trim().split(/\s+/);
    const type = atCategory(c);
    if (!type) continue;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length) trips.set(r.trip_id, { id: r.trip_id, type, number: n.replace(/^0+(?=\d)/, ""), runs, st: [] });
  }
  for (const r of files.stop_times) {
    const t = trips.get(r.trip_id);
    if (t) t.st.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null, pu: r.pickup_type, dr: r.drop_off_type });
  }
  const rows = new Map(files.stops.map((r) => [r.stop_id, r]));
  const station = (id) => { const r = rows.get(id) || {}; const p = rows.get(atParent(r)) || r; return { key: atParent(r), raw: p.stop_name || r.stop_name || id, lat: parseFloat(p.stop_lat ?? r.stop_lat), lon: parseFloat(p.stop_lon ?? r.stop_lon), pf: (r.platform_code || "").trim() }; };
  const out = [];
  for (const d of dates) {
    // pieces running that day, per category and number
    const groups = new Map();
    for (const t of trips.values()) {
      if (!t.runs.includes(d) || t.st.length < 2) continue;
      const st = t.st.sort((a, b) => a.seq - b.seq).map((s) => ({ ...s, ...station(s.id) }))
        .filter((s) => !isTariffPoint(s.raw) && !(s.pu === "1" && s.dr === "1"));
      if (st.length < 2) continue;
      const k = t.type + "|" + t.number;
      (groups.get(k) || groups.set(k, []).get(k)).push({ ...t, st });
    }
    for (const pieces of groups.values()) {
      pieces.sort((a, b) => mins(a.st[0].dep || a.st[0].arr) - mins(b.st[0].dep || b.st[0].arr));
      const used = new Set();
      for (const p of pieces) {
        if (used.has(p)) continue;
        used.add(p);
        let st = [...p.st];
        for (;;) {
          const last = st[st.length - 1];
          const next = pieces.find((q) => !used.has(q) && q.st[0].key === last.key && ((dt) => dt >= 0 && dt <= 90)(mins(q.st[0].dep || q.st[0].arr) - mins(last.arr || last.dep)));
          if (!next) break;
          used.add(next);
          st = [...st.slice(0, -1), { ...last, dep: next.st[0].dep, pf: next.st[0].pf || last.pf }, ...next.st.slice(1)];
        }
        if (ring && !st.some((s) => Number.isFinite(s.lat) && inRing(ring, s.lon, s.lat))) continue; // never in Austria
        const stops = st.map((s, i) => ({
          seq: i + 1, id: s.key, arr: s.arr, dep: s.dep,
          name: atStopName(s.raw, s.lat, s.lon), time: hhmm(s.dep || s.arr), delay: 0,
          ...(Number.isFinite(s.lat) ? { lat: Math.round(s.lat * 1e4) / 1e4, lon: Math.round(s.lon * 1e4) / 1e4 } : {}),
          ...(/^[0-9]{1,3}[A-Z]?(-[A-Z])?$/i.test(s.pf) ? { pf: s.pf.toUpperCase() } : {}),
        }));
        out.push({
          id: `${d}_at_${p.id}`, trip_id: p.id, service_date: d, country: "at", number: p.number, type: p.type,
          origin: stops[0].name, destination: stops[stops.length - 1].name,
          dep: hhmm(stops[0].dep || stops[0].arr), arr: hhmm(stops[stops.length - 1].arr || stops[stops.length - 1].dep), stops,
        });
      }
    }
  }
  return out;
}
