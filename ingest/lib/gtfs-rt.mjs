// Minimalan dekoder za GTFS-Realtime (protobuf) – samo polja koja nam trebaju.
// Specifikacija: https://gtfs.org/realtime/reference/

// Varints are read as plain numbers (fast); only the rare values above 2^53 fall back to BigInt.
// Negative int64 values (10-byte varints) come out right as well.
function reader(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0, mul = 1;
    for (let i = 0; i < 7; i++) { // up to 49 bits fit exactly in a JS number
      if (pos >= buf.length) throw new Error("Protobuf: neočekivan kraj podataka");
      const b = buf[pos++];
      result += (b & 0x7f) * mul;
      if (!(b & 0x80)) return result;
      mul *= 128;
    }
    let big = BigInt(result), shift = 49n;
    for (;;) {
      if (pos >= buf.length) throw new Error("Protobuf: neočekivan kraj podataka");
      const b = buf[pos++];
      big |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return Number(BigInt.asIntN(64, big));
      shift += 7n;
    }
  };
  return {
    eof: () => pos >= buf.length,
    tag() { const t = varint(); return { field: Math.floor(t / 8), wire: t & 7 }; },
    varint,
    bytes() { const len = varint(); const b = buf.subarray(pos, pos + len); pos += len; return b; },
    skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) pos += 8;
      else if (wire === 2) { const len = varint(); pos += len; }
      else if (wire === 5) pos += 4;
      else throw new Error(`Protobuf: nepoznat wire tip ${wire}`);
    },
  };
}

const int = (v) => v;
const utf8 = new TextDecoder();
const str = (b) => utf8.decode(b);

function parse(buf, handlers, init) {
  const r = reader(buf);
  const obj = init();
  while (!r.eof()) {
    const { field, wire } = r.tag();
    const h = handlers[field];
    if (h && wire === h[0]) h[1](obj, wire === 2 ? r.bytes() : r.varint());
    else r.skip(wire);
  }
  return obj;
}

const StopTimeEvent = (b) => parse(b, {
  1: [0, (o, v) => (o.delay = int(v))],
  2: [0, (o, v) => (o.time = int(v))],
}, () => ({}));

const OVapiStop = (b) => parse(b, {
  2: [2, (o, v) => (o.track = str(v))],
  3: [2, (o, v) => (o.actual = str(v))],
  4: [2, (o, v) => (o.station = str(v))],
}, () => ({}));

const StopTimeUpdate = (b) => parse(b, {
  1: [0, (o, v) => (o.stopSequence = int(v))],
  2: [2, (o, v) => (o.arrival = StopTimeEvent(v))],
  3: [2, (o, v) => (o.departure = StopTimeEvent(v))],
  4: [2, (o, v) => (o.stopId = str(v))],
  5: [0, (o, v) => (o.scheduleRelationship = int(v))], // 0 SCHEDULED, 1 SKIPPED, 2 NO_DATA
  // OVapi (Netherlands) extension: planned track, actual (changed) track, station code
  1003: [2, (o, v) => (o.ovapi = OVapiStop(v))],
}, () => ({}));

const TripDescriptor = (b) => parse(b, {
  1: [2, (o, v) => (o.tripId = str(v))],
  2: [2, (o, v) => (o.startTime = str(v))],
  3: [2, (o, v) => (o.startDate = str(v))],
  4: [0, (o, v) => (o.scheduleRelationship = int(v))], // 3 = CANCELED
  5: [2, (o, v) => (o.routeId = str(v))],
}, () => ({}));

// Stop updates are decoded only for trips we keep (a national feed is mostly buses and trams)
let keepTrip = null;
const TripUpdate = (b) => {
  const raw = [];
  const o = parse(b, {
    1: [2, (o, v) => (o.trip = TripDescriptor(v))],
    2: [2, (o, v) => raw.push(v)],
    4: [0, (o, v) => (o.timestamp = int(v))],
    5: [0, (o, v) => (o.delay = int(v))],
  }, () => ({ stopTimeUpdates: [] }));
  if (keepTrip && !keepTrip(o.trip)) return null;
  o.stopTimeUpdates = raw.map(StopTimeUpdate);
  return o;
};

// Service Alerts: official notices (works, disruptions…) with the trips/routes/stops they concern
const Translation = (b) => parse(b, { 1: [2, (o, v) => (o.text = str(v))], 2: [2, (o, v) => (o.lang = str(v))] }, () => ({}));
const TranslatedString = (b) => parse(b, { 1: [2, (o, v) => o.t.push(Translation(v))] }, () => ({ t: [] })).t;
const TimeRange = (b) => parse(b, { 1: [0, (o, v) => (o.start = int(v))], 2: [0, (o, v) => (o.end = int(v))] }, () => ({}));
const EntitySelector = (b) => parse(b, {
  1: [2, (o, v) => (o.agencyId = str(v))],
  2: [2, (o, v) => (o.routeId = str(v))],
  3: [0, (o, v) => (o.routeType = int(v))],
  4: [2, (o, v) => (o.trip = TripDescriptor(v))],
  5: [2, (o, v) => (o.stopId = str(v))],
}, () => ({}));
const Alert = (b) => parse(b, {
  1: [2, (o, v) => o.activePeriods.push(TimeRange(v))],
  5: [2, (o, v) => o.informed.push(EntitySelector(v))],
  6: [0, (o, v) => (o.cause = int(v))],
  7: [0, (o, v) => (o.effect = int(v))],
  8: [2, (o, v) => (o.url = TranslatedString(v))],
  10: [2, (o, v) => (o.header = TranslatedString(v))],
  11: [2, (o, v) => (o.description = TranslatedString(v))],
}, () => ({ activePeriods: [], informed: [] }));

const FeedEntity = (b) => parse(b, {
  1: [2, (o, v) => (o.id = str(v))],
  2: [0, (o, v) => (o.isDeleted = v !== 0)],
  3: [2, (o, v) => { const tu = TripUpdate(v); if (tu) o.tripUpdate = tu; }],
  5: [2, (o, v) => (o.alert = Alert(v))],
}, () => ({}));

const FeedHeader = (b) => parse(b, {
  1: [2, (o, v) => (o.version = str(v))],
  3: [0, (o, v) => (o.timestamp = int(v))],
}, () => ({}));

// keep (optional): function(trip) -> true for the trips we care about; other entities are skipped
export function decodeFeed(buf, keep = null) {
  keepTrip = keep;
  try {
    return parse(buf, {
      1: [2, (o, v) => (o.header = FeedHeader(v))],
      2: [2, (o, v) => { const e = FeedEntity(v); if (e.tripUpdate || e.alert || !keep) o.entities.push(e); }],
    }, () => ({ header: {}, entities: [] }));
  } finally { keepTrip = null; }
}
