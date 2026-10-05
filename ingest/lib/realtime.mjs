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
