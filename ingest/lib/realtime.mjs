// Računanje kašnjenja jednog voza iz GTFS-RT "TripUpdate" poruke.
import { gtfsToEpoch, platformOf } from "./util.mjs";

const SKIPPED = 1;
const CANCELED = 3;

// row: red iz tabele trains ({ service_date, stops: [{seq, id, arr, dep, ...}] })
// tu: TripUpdate iz dekodera
// nowSec: trenutno vreme u Unix sekundama
export function applyTripUpdate(row, tu, nowSec) {
  const stops = row.stops.map((s) => ({ ...s }));
  const bySeq = new Map(), byId = new Map(), byStation = new Map();
  for (const u of tu.stopTimeUpdates) {
    if (u.stopSequence != null) bySeq.set(u.stopSequence, u);
    if (u.stopId) byId.set(u.stopId, u);
    if (u.ovapi?.station) byStation.set(u.ovapi.station.toLowerCase(), u); // Netherlands: station code, also when the track changed
  }

  const schedEpoch = (s) => gtfsToEpoch(row.service_date, s.arr || s.dep);

  let carry = tu.delay ?? null; // kašnjenje se prenosi na sledeće stanice dok ne stigne nova vrednost
  let anyUpdate = carry != null;
  for (const s of stops) {
    const u = bySeq.get(s.seq) ?? byId.get(s.id) ?? (s.st ? byStation.get(s.st) : undefined);
    s.skipped = false;
    delete s.apf;
    if (u) {
      // platform change: the feed names a different track of the same station (Belgium: "8814001_12" instead of "_14")
      // Netherlands: OVapi gives the actual track itself
      const apf = u.ovapi?.actual ? platformOf("", u.ovapi.actual) : u.stopId && u.stopId !== s.id ? platformOf(u.stopId) : null;
      if (apf && apf !== s.pf) s.apf = apf;
      if (u.scheduleRelationship === SKIPPED) s.skipped = true;
      const ev = u.arrival ?? u.departure;
      let sec = null;
      if (ev?.delay != null) sec = ev.delay;
      else if (ev?.time != null) {
        const ref = u.arrival ? (s.arr || s.dep) : (s.dep || s.arr);
        sec = ev.time - gtfsToEpoch(row.service_date, ref);
      }
      if (sec != null) { carry = sec; anyUpdate = true; }
    }
    s.delay = Math.max(0, Math.round((carry ?? 0) / 60));
  }

  const allSkipped = stops.length > 0 && stops.every((s) => s.skipped);
  const cancelled = tu.trip?.scheduleRelationship === CANCELED || allSkipped;

  // Trenutno kašnjenje = kašnjenje na sledećoj stanici do koje voz još nije stigao
  let delay = stops.length ? stops[stops.length - 1].delay : 0;
  for (const s of stops) {
    if (s.skipped) continue;
    if (schedEpoch(s) + s.delay * 60 >= nowSec) { delay = s.delay; break; }
  }

  return { id: row.id, delay_min: cancelled ? 0 : delay, cancelled, stops, anyUpdate };
}

// Pronalazi red za TripUpdate: po trip_id, a ako je dat start_date, i po datumu
export function matchRow(index, trip) {
  if (!trip?.tripId) return null;
  const rows = index.get(trip.tripId);
  if (!rows?.length) return null;
  if (trip.startDate && /^\d{8}$/.test(trip.startDate)) {
    const d = `${trip.startDate.slice(0, 4)}-${trip.startDate.slice(4, 6)}-${trip.startDate.slice(6)}`;
    return rows.find((r) => r.service_date === d) ?? null;
  }
  return rows[rows.length - 1];
}

// Belgium: SNCB trip ids end in a validity date and often a version number ("...:20261211:2").
// When SNCB republishes its timetable the version can change between our daily copy and the live feed,
// so the exact id no longer matches. tripBase drops only that version number.
export function tripBase(id) {
  const m = /^(.*:\d{8})(?::\d{1,3})?$/.exec(id || "");
  return m ? m[1] : null;
}

// Belgium: a "line" = the two terminus stations in the trip id, both directions ("8821006-8833001").
// Used for the lines the SNCB feed never reports (table rt_quiet_lines).
export function lineKey(tripId) {
  const p = String(tripId || "").split(":");
  const a = p[5], b = p[6];
  if (!/^\d{7}$/.test(a || "") || !/^\d{7}$/.test(b || "")) return null;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Fallback match on the id without its version: only when exactly one of our trains fits that day,
// so a delay is never attached to the wrong train.
export function matchRowLoose(baseIndex, trip) {
  const base = tripBase(trip?.tripId);
  if (!base) return null;
  let rows = baseIndex.get(base) || [];
  if (trip.startDate && /^\d{8}$/.test(trip.startDate)) {
    const d = `${trip.startDate.slice(0, 4)}-${trip.startDate.slice(4, 6)}-${trip.startDate.slice(6)}`;
    rows = rows.filter((r) => r.service_date === d);
  }
  return rows.length === 1 ? rows[0] : null;
}

// Switzerland: a trip id carries a running number that changes with every timetable version
// (IC 870: ".ojp-91-2-G.1.TA.680.j26" on 25.10.2026, ".ojp-91-2-G.1.TA.623.j26" on 26.10.2026). On the days a new
// timetable comes out (Mondays and Thursdays) our copy has the new ids in the morning while the live feed still used
// the old ones until the evening: two thirds of the Swiss trains had no live data on those days.
// The "slot" = the id without that number + the trip's start time + its date, the same in both versions.
export function tripSlot(tripId, startTime, startDate) {
  const id = String(tripId || ""), line = id.replace(/\.TA\.\d+\./, ".TA.");
  if (line === id || !/^\d{1,2}:\d{2}:\d{2}$/.test(startTime || "") || !/^\d{8}$/.test(startDate || "")) return null;
  return `${line}|${startTime.padStart(8, "0")}|${startDate}`;
}
export const rowSlot = (r) => {
  const s = (r.stops || []).find((x) => x.dep || x.arr);
  return s ? tripSlot(r.trip_id, s.dep || s.arr, String(r.service_date || "").replaceAll("-", "")) : null;
};
// only when exactly one of our trains has that slot
export function matchRowSlot(slotIndex, trip) {
  const k = tripSlot(trip?.tripId, trip?.startTime, trip?.startDate);
  const rows = k ? slotIndex.get(k) || [] : [];
  return rows.length === 1 ? rows[0] : null;
}

// Belgium: the SNCB feed lists only trains that deviate from the timetable. A train that is running now
// and is missing from the feed is on time -> all delays 0. A train that already arrived is left as it was
// (its last known delay stays). Returns null when nothing should be written.
export function onTimeUpdate(row, nowSec) {
  const st = (row.stops || []).filter((s) => s.arr || s.dep);
  if (st.length < 2) return null;
  const first = gtfsToEpoch(row.service_date, st[0].dep || st[0].arr);
  const last = gtfsToEpoch(row.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
  if (nowSec < first || nowSec > last + (row.delay_min || 0) * 60) return null;
  return { id: row.id, delay_min: 0, cancelled: false, stops: row.stops.map((s) => ({ ...s, delay: 0, skipped: false })) };
}
