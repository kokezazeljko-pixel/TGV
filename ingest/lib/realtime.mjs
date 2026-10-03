// Računanje kašnjenja jednog voza iz GTFS-RT "TripUpdate" poruke.
import { gtfsToEpoch } from "./util.mjs";

const SKIPPED = 1;
const CANCELED = 3;

// row: red iz tabele trains ({ service_date, stops: [{seq, id, arr, dep, ...}] })
// tu: TripUpdate iz dekodera
// nowSec: trenutno vreme u Unix sekundama
export function applyTripUpdate(row, tu, nowSec) {
  const stops = row.stops.map((s) => ({ ...s }));
  const bySeq = new Map(), byId = new Map();
  for (const u of tu.stopTimeUpdates) {
    if (u.stopSequence != null) bySeq.set(u.stopSequence, u);
    if (u.stopId) byId.set(u.stopId, u);
  }

  const schedEpoch = (s) => gtfsToEpoch(row.service_date, s.arr || s.dep);

  let carry = tu.delay ?? null; // kašnjenje se prenosi na sledeće stanice dok ne stigne nova vrednost
  let anyUpdate = carry != null;
  for (const s of stops) {
    const u = bySeq.get(s.seq) ?? byId.get(s.id);
    s.skipped = false;
    if (u) {
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
