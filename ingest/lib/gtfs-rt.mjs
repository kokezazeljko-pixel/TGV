// Minimalan dekoder za GTFS-Realtime (protobuf) – samo polja koja nam trebaju.
// Specifikacija: https://gtfs.org/realtime/reference/

function reader(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0n, shift = 0n;
    for (;;) {
      if (pos >= buf.length) throw new Error("Protobuf: neočekivan kraj podataka");
      const b = buf[pos++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
      shift += 7n;
    }
  };
  return {
    eof: () => pos >= buf.length,
    tag() { const t = Number(varint()); return { field: t >>> 3, wire: t & 7 }; },
    varint,
    bytes() { const len = Number(varint()); const b = buf.subarray(pos, pos + len); pos += len; return b; },
    skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) pos += 8;
      else if (wire === 2) { const len = Number(varint()); pos += len; }
      else if (wire === 5) pos += 4;
      else throw new Error(`Protobuf: nepoznat wire tip ${wire}`);
    },
  };
}

const int = (v) => Number(BigInt.asIntN(64, v));
const str = (b) => Buffer.from(b).toString("utf8");

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

const StopTimeUpdate = (b) => parse(b, {
  1: [0, (o, v) => (o.stopSequence = int(v))],
  2: [2, (o, v) => (o.arrival = StopTimeEvent(v))],
  3: [2, (o, v) => (o.departure = StopTimeEvent(v))],
  4: [2, (o, v) => (o.stopId = str(v))],
  5: [0, (o, v) => (o.scheduleRelationship = int(v))], // 0 SCHEDULED, 1 SKIPPED, 2 NO_DATA
}, () => ({}));

const TripDescriptor = (b) => parse(b, {
  1: [2, (o, v) => (o.tripId = str(v))],
  2: [2, (o, v) => (o.startTime = str(v))],
  3: [2, (o, v) => (o.startDate = str(v))],
  4: [0, (o, v) => (o.scheduleRelationship = int(v))], // 3 = CANCELED
  5: [2, (o, v) => (o.routeId = str(v))],
}, () => ({}));

const TripUpdate = (b) => parse(b, {
  1: [2, (o, v) => (o.trip = TripDescriptor(v))],
  2: [2, (o, v) => o.stopTimeUpdates.push(StopTimeUpdate(v))],
  4: [0, (o, v) => (o.timestamp = int(v))],
  5: [0, (o, v) => (o.delay = int(v))],
}, () => ({ stopTimeUpdates: [] }));

const FeedEntity = (b) => parse(b, {
  1: [2, (o, v) => (o.id = str(v))],
  2: [0, (o, v) => (o.isDeleted = v !== 0n)],
  3: [2, (o, v) => (o.tripUpdate = TripUpdate(v))],
}, () => ({}));

const FeedHeader = (b) => parse(b, {
  1: [2, (o, v) => (o.version = str(v))],
  3: [0, (o, v) => (o.timestamp = int(v))],
}, () => ({}));

export function decodeFeed(buf) {
  return parse(buf, {
    1: [2, (o, v) => (o.header = FeedHeader(v))],
    2: [2, (o, v) => o.entities.push(FeedEntity(v))],
  }, () => ({ header: {}, entities: [] }));
}
