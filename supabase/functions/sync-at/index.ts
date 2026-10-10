// GENERISANO iz source.mjs (bun build source.mjs --target=node --format=esm --external node:* --outfile index.ts) – ne menjati ručno.
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
var DE_TT_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/";
var DE_CATS = { ICE: "ICE", IC: "IC", EC: "EC", ECE: "EC", EN: "Night train", NJ: "Night train", RJ: "Railjet", RJX: "Railjet", TGV: "TGV", FLX: "FLX" };
var deCategory = (s = "") => DE_CATS[(String(s).trim().match(/^[A-Za-z]+/) || [""])[0].toUpperCase()] || null;
var DE_SKIP_AGENCIES = new Set(["1"]);
var deNorm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/hauptbahnhof/g, "hbf").replace(/\bbahnhof\b|\bbf\b/g, "").replace(/[^a-z0-9]+/g, "");
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
function germanUpdates(trains, plan, nowSec, opts = {}) {
  const catOf = opts.catOf || deCategory;
  const idx = new Map;
  const put = (hub, kind, iso, p) => {
    const m = Math.round(Date.parse(iso) / 60000), k = `${hub}|${kind}`;
    let h = idx.get(k);
    if (!h)
      idx.set(k, h = new Map);
    (h.get(m) || h.set(m, []).get(m)).push(p);
  };
  for (const p of plan) {
    if (!catOf(p.cat))
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
        const isFlx = catOf(p.cat) === "FLX";
        if (flix ? !(isFlx && tr.number && p.num === tr.number) : isFlx)
          continue;
        const same = catOf(p.cat) === tr.type;
        const k = opts.keepNumbers && tr.number && p.num === tr.number ? 2 : 1;
        if (dt === 0)
          out.push([p, (same ? 3 : 1.5) * k, true]);
        else if (same)
          out.push([p, k / (Math.abs(dt) + 1), false]);
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
    const number = tr.type === "FLX" || opts.keepNumbers ? null : tie ? "" : key.startsWith("?") ? null : key;
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

// ../../../ingest/lib/austria.mjs
var AT_GTFS_URL = "https://static.web.oebb.at/open-data/soll-fahrplan-gtfs/GTFS_Fahrplan_2026.zip";
var AT_CATS = { RJ: "Railjet", RJX: "Railjet", IC: "IC", EC: "EC", ECE: "EC", EN: "Night train", NJ: "Night train", D: "D", ICE: "ICE" };
var atCategory = (s = "") => AT_CATS[(String(s).trim().match(/^[A-Za-z]+/) || [""])[0].toUpperCase()] || null;
var isTariffPoint = (name = "") => /Tarifpunkt|^TP\s/i.test(name);
var FIXED = {
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
  "Kyjiw-Passaschyrskyj": "Kyiv-Pasazhyrskyi"
};
var TWINS = [
  ["Neumarkt", (lon) => lon < 13.6 ? "Neumarkt am Wallersee" : "Neumarkt in der Steiermark"],
  ["St.Johann", () => "St. Johann im Pongau"]
];
function atStopName(raw = "", lat = null, lon = null) {
  let s = raw.trim().replace(/\s+(Bahnhof|Bahnhst|Haltestelle|Bf\.|Bhf\.)$/, "").replace(/\s+Bahnhst\s+\(.*\)$/, "").replace(/\s+S-Bahn$/, "").replace(/\s+Hauptbahnhof$/, " Hbf");
  for (const [n, f] of TWINS)
    if (s === n)
      return f(lon);
  if (FIXED[s])
    return FIXED[s];
  s = s.replace(/^([^,]+), Stazione di .*$/, "$1").replace(/\s+(stazione|železniška postaja|Železniška postaja|pályaudvar|stacja kolejowa|stanica|željeznički kolodvor)$/i, "").replace(/\bSt\.(?=\S)/g, "St. ");
  return s;
}
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
var hhmm2 = (hms) => {
  if (!hms)
    return null;
  const [h, m] = hms.split(":").map(Number);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
var mins = (hms) => {
  const [h, m] = hms.split(":").map(Number);
  return h * 60 + m;
};
function inRing(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1;i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
      c = !c;
  }
  return c;
}
var atParent = (r) => r.parent_station || ((g) => g ? `P${g[1]}:${g[2]}:${g[3]}` : r.stop_id)(/^([a-z]{2}):(\d+):(\d+)/.exec(r.stop_id));
function buildAustrianSchedule(files, dates, ring) {
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
  const rail = new Set(files.routes.filter((r) => String(r.route_type) === "2").map((r) => r.route_id));
  const trips = new Map;
  for (const r of files.trips) {
    if (!rail.has(r.route_id))
      continue;
    const [c, n = ""] = (r.trip_short_name || "").trim().split(/\s+/);
    const type = atCategory(c);
    if (!type)
      continue;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length)
      trips.set(r.trip_id, { id: r.trip_id, type, number: n.replace(/^0+(?=\d)/, ""), runs, st: [] });
  }
  for (const r of files.stop_times) {
    const t = trips.get(r.trip_id);
    if (t)
      t.st.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null, pu: r.pickup_type, dr: r.drop_off_type });
  }
  const rows = new Map(files.stops.map((r) => [r.stop_id, r]));
  const station = (id) => {
    const r = rows.get(id) || {};
    const p = rows.get(atParent(r)) || r;
    return { key: atParent(r), raw: p.stop_name || r.stop_name || id, lat: parseFloat(p.stop_lat ?? r.stop_lat), lon: parseFloat(p.stop_lon ?? r.stop_lon), pf: (r.platform_code || "").trim() };
  };
  const out = [];
  for (const d of dates) {
    const groups = new Map;
    for (const t of trips.values()) {
      if (!t.runs.includes(d) || t.st.length < 2)
        continue;
      const st = t.st.sort((a, b) => a.seq - b.seq).map((s) => ({ ...s, ...station(s.id) })).filter((s) => !isTariffPoint(s.raw) && !(s.pu === "1" && s.dr === "1"));
      if (st.length < 2)
        continue;
      const k = t.type + "|" + t.number;
      (groups.get(k) || groups.set(k, []).get(k)).push({ ...t, st });
    }
    for (const pieces of groups.values()) {
      pieces.sort((a, b) => mins(a.st[0].dep || a.st[0].arr) - mins(b.st[0].dep || b.st[0].arr));
      const used = new Set;
      for (const p of pieces) {
        if (used.has(p))
          continue;
        used.add(p);
        let st = [...p.st];
        for (;; ) {
          const last = st[st.length - 1];
          const next = pieces.find((q) => !used.has(q) && q.st[0].key === last.key && ((dt) => dt >= 0 && dt <= 90)(mins(q.st[0].dep || q.st[0].arr) - mins(last.arr || last.dep)));
          if (!next)
            break;
          used.add(next);
          st = [...st.slice(0, -1), { ...last, dep: next.st[0].dep, pf: next.st[0].pf || last.pf }, ...next.st.slice(1)];
        }
        if (ring && !st.some((s) => Number.isFinite(s.lat) && inRing(ring, s.lon, s.lat)))
          continue;
        const stops = st.map((s, i) => ({
          seq: i + 1,
          id: s.key,
          arr: s.arr,
          dep: s.dep,
          name: atStopName(s.raw, s.lat, s.lon),
          time: hhmm2(s.dep || s.arr),
          delay: 0,
          ...Number.isFinite(s.lat) ? { lat: Math.round(s.lat * 1e4) / 1e4, lon: Math.round(s.lon * 1e4) / 1e4 } : {},
          .../^[0-9]{1,3}[A-Z]?(-[A-Z])?$/i.test(s.pf) ? { pf: s.pf.toUpperCase() } : {}
        }));
        out.push({
          id: `${d}_at_${p.id}`,
          trip_id: p.id,
          service_date: d,
          country: "at",
          number: p.number,
          type: p.type,
          origin: stops[0].name,
          destination: stops[stops.length - 1].name,
          dep: hhmm2(stops[0].dep || stops[0].arr),
          arr: hhmm2(stops[stops.length - 1].arr || stops[stops.length - 1].dep),
          stops
        });
      }
    }
  }
  return out;
}
// at-border.json
var at_border_default = {
  note: "Austria's border (land[0] of lib/network-at.json): a train is Austrian if it stops inside it. Regenerate when that map's land changes.",
  ring: [[9.528, 47.271], [9.609, 47.392], [9.626, 47.467], [9.524, 47.524], [9.651, 47.526], [9.749, 47.576], [9.972, 47.505], [10.06, 47.449], [10.066, 47.393], [10.2, 47.363], [10.183, 47.279], [10.313, 47.313], [10.369, 47.366], [10.404, 47.417], [10.439, 47.552], [10.873, 47.52], [10.894, 47.47], [10.981, 47.398], [11.042, 47.393], [11.191, 47.425], [11.298, 47.425], [11.374, 47.46], [11.393, 47.487], [11.717, 47.583], [12.186, 47.62], [12.209, 47.718], [12.363, 47.688], [12.483, 47.637], [12.686, 47.669], [12.771, 47.639], [12.796, 47.607], [12.783, 47.564], [12.809, 47.542], [12.968, 47.476], [13.014, 47.478], [13.054, 47.655], [13.034, 47.699], [12.898, 47.722], [12.954, 47.808], [12.954, 47.891], [12.76, 48.076], [12.76, 48.107], [12.814, 48.161], [13.082, 48.275], [13.323, 48.331], [13.375, 48.361], [13.409, 48.394], [13.46, 48.565], [13.487, 48.582], [13.675, 48.523], [13.724, 48.542], [13.785, 48.587], [13.815, 48.767], [13.989, 48.692], [14.049, 48.602], [14.19, 48.579], [14.368, 48.576], [14.431, 48.616], [14.489, 48.626], [14.691, 48.599], [14.707, 48.672], [14.786, 48.747], [14.822, 48.774], [14.923, 48.771], [14.972, 48.984], [14.993, 49.001], [15.067, 48.998], [15.162, 48.946], [15.311, 48.974], [15.701, 48.86], [15.825, 48.864], [16.057, 48.755], [16.367, 48.739], [16.478, 48.8], [16.544, 48.796], [16.713, 48.734], [16.884, 48.704], [16.949, 48.589], [16.943, 48.551], [16.863, 48.441], [16.865, 48.387], [17.086, 48.04], [17.147, 48.006], [17.089, 47.964], [17.078, 47.901], [17.04, 47.873], [17.03, 47.837], [17.067, 47.708], [16.786, 47.679], [16.591, 47.751], [16.551, 47.747], [16.421, 47.674], [16.432, 47.656], [16.64, 47.609], [16.677, 47.536], [16.623, 47.448], [16.515, 47.405], [16.443, 47.4], [16.434, 47.367], [16.463, 47.273], [16.417, 47.223], [16.438, 47.146], [16.483, 47.14], [16.493, 47.123], [16.453, 47.007], [16.332, 47.002], [16.253, 46.972], [16.093, 46.863], [16.037, 46.845], [15.977, 46.801], [15.98, 46.706], [15.958, 46.678], [15.767, 46.711], [15.633, 46.698], [15.439, 46.63], [15.217, 46.643], [14.893, 46.606], [14.841, 46.58], [14.757, 46.499], [14.597, 46.436], [14.55, 46.4], [13.831, 46.511], [13.49, 46.556], [13.169, 46.573], [12.479, 46.673], [12.388, 46.703], [12.154, 46.935], [12.131, 46.985], [12.201, 47.061], [12.169, 47.082], [11.776, 46.986], [11.528, 46.997], [11.244, 46.976], [11.134, 46.936], [11.025, 46.797], [10.927, 46.769], [10.76, 46.793], [10.689, 46.846], [10.453, 46.865], [10.455, 46.899], [10.415, 46.964], [10.349, 46.985], [10.18, 46.862], [10.133, 46.852], [9.878, 46.938], [9.845, 47.007], [9.58, 47.057], [9.611, 47.107], [9.556, 47.185], [9.528, 47.271]]
};

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var DB_ID = Deno.env.get("DB_CLIENT_ID") || "";
var DB_KEY = Deno.env.get("DB_API_KEY") || "";
var UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
var PER_RUN = 6;
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
async function tt(path) {
  const res = await fetch(DE_TT_BASE + path, { headers: { ...UA, "DB-Client-Id": DB_ID, "DB-Api-Key": DB_KEY, Accept: "application/xml" } });
  if (res.status === 404)
    return "";
  if (!res.ok)
    throw new Error(`timetables ${path.split("/")[0]} -> ${res.status}`);
  return res.text();
}
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function range(a, b) {
  const r = await fetch(AT_GTFS_URL, { headers: { ...UA, Range: `bytes=${a}-${b}` } });
  if (r.status !== 206)
    throw new Error(`ÖBB GTFS range -> ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function zipDir() {
  const h = await fetch(AT_GTFS_URL, { method: "HEAD", headers: UA });
  if (!h.ok)
    throw new Error(`ÖBB GTFS -> ${h.status} (new timetable year? see AT_GTFS_URL)`);
  const size = Number(h.headers.get("content-length"));
  const tail = await range(Math.max(0, size - 65536), size - 1), dv = new DataView(tail.buffer);
  let e = -1;
  for (let i = tail.length - 22;i >= 0; i--)
    if (dv.getUint32(i, true) === 101010256) {
      e = i;
      break;
    }
  if (e < 0)
    throw new Error("ÖBB GTFS: not a zip file");
  const count = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  const cd = await range(cdOff, cdOff + cdSize - 1), cv = new DataView(cd.buffer);
  const files = {};
  let p = 0;
  for (let n = 0;n < count; n++) {
    const method = cv.getUint16(p + 10, true), comp = cv.getUint32(p + 20, true), nl = cv.getUint16(p + 28, true), xl = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true), off = cv.getUint32(p + 42, true);
    files[new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return files;
}
async function readCsv(files, name, keep = null) {
  const f = files[name];
  if (!f)
    return [];
  const head = await range(f.off, f.off + 29), hv = new DataView(head.buffer);
  const start = f.off + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const r = await fetch(AT_GTFS_URL, { headers: { ...UA, Range: `bytes=${start}-${start + f.comp - 1}` } });
  if (r.status !== 206)
    throw new Error(`ÖBB GTFS ${name} -> ${r.status}`);
  const reader = (f.method === 8 ? r.body.pipeThrough(new DecompressionStream("deflate-raw")) : r.body).getReader();
  const td = new TextDecoder;
  let rest = "", cols = null;
  const out = [];
  const line = (l) => {
    if (l.endsWith("\r"))
      l = l.slice(0, -1);
    if (!l)
      return;
    if (!cols) {
      cols = parseLine(l.replace(/^﻿/, "")).map((s) => s.trim());
      return;
    }
    if (keep && !keep(l))
      return;
    const v = parseLine(l), o = {};
    cols.forEach((c, i) => o[c] = v[i] ?? "");
    out.push(o);
  };
  for (;; ) {
    const { value, done } = await reader.read();
    if (done)
      break;
    const parts = (rest + td.decode(value, { stream: true })).split(`
`);
    rest = parts.pop() || "";
    for (const l of parts)
      line(l);
  }
  line(rest);
  return out;
}
async function loadSchedule() {
  const dates = [parisDate(0), parisDate(1)];
  const files = await zipDir();
  const ymds = dates.map((d) => d.replaceAll("-", ""));
  const routes = await readCsv(files, "routes.txt");
  const trips = (await readCsv(files, "trips.txt")).filter((r) => atCategory((r.trip_short_name || "").trim().split(/\s+/)[0]));
  const tripIds = new Set(trips.map((r) => r.trip_id));
  const stop_times = await readCsv(files, "stop_times.txt", (l) => tripIds.has(l.slice(l[0] === '"' ? 1 : 0, l.indexOf(l[0] === '"' ? '"' : ",", 1))));
  const stops = await readCsv(files, "stops.txt");
  const calendar = await readCsv(files, "calendar.txt");
  const calendar_dates = await readCsv(files, "calendar_dates.txt", (l) => ymds.some((y) => l.includes(y)));
  return { dates, rows: buildAustrianSchedule({ routes, trips, stop_times, stops, calendar, calendar_dates }, dates, at_border_default.ring) };
}
async function schedule() {
  const { dates, rows } = await loadSchedule();
  if (rows.length < 100)
    throw new Error(`only ${rows.length} trains found – nothing changed`);
  for (let i = 0;i < rows.length; i += 300)
    await upsert("trains", rows.slice(i, i + 300), "id");
  const fresh = new Set(rows.map((r) => r.id));
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.at&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0;i < stale.length; i += 80)
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
  }
  await rest("DELETE", `trains?country=eq.at&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length };
}
async function preview() {
  const { dates, rows } = await loadSchedule();
  const byType = {};
  for (const r of rows)
    byType[r.type] = (byType[r.type] || 0) + 1;
  const dup = new Map;
  for (const r of rows) {
    const k = r.service_date + "|" + r.type + "|" + r.number;
    dup.set(k, (dup.get(k) || 0) + 1);
  }
  await rest("DELETE", "trains_preview?country=eq.at", null, { Prefer: "return=minimal" });
  for (let i = 0;i < rows.length; i += 300)
    await upsert("trains_preview", rows.slice(i, i + 300), "id");
  const zero = rows.filter((r) => r.stops.some((s) => s.lat === 0 && s.lon === 0)).map((r) => r.type + " " + r.number);
  return { kind: "preview", dates, trains: rows.length, byType, sameNumberTwice: [...dup].filter(([, n]) => n > 1).map(([k]) => k).slice(0, 40), zeroCoords: zero.slice(0, 20), sample: rows.filter((r) => r.service_date === dates[0]).slice(0, 2) };
}
async function hubEva(h) {
  if (h.eva)
    return h.eva;
  const xml = await tt(`station/${encodeURIComponent(h.name)}`);
  const all = [...xml.matchAll(/<station ([^>]*)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([a-z0-9]+)=['"]([^'"]*)['"]/gi)].map((x) => [x[1], x[2]])));
  const hit = all.find((s) => deNorm(s.name) === deNorm(h.name)) || all[0];
  const eva = hit?.eva || null;
  await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { eva, last_error: eva ? null : "station not found", ...eva ? {} : { last_fchg: new Date().toISOString() } }, { Prefer: "return=minimal" });
  return eva;
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
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(hr);
    const g = (t) => p.find((x) => x.type === t).value;
    const xml = await tt(`plan/${eva}/${g("year")}${g("month")}${g("day")}/${g("hour")}`);
    calls++;
    const { station, stops } = parseTimetable(xml);
    const rows = stops.filter((s) => s.tl && atCategory(s.tl.c)).map((s) => ({
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
      await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { station }, { Prefer: "return=minimal" });
    }
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
  await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  return calls;
}
async function realtime() {
  const t0 = Date.now();
  const hubs = await rest("GET", `at_hubs?select=name,eva,station,last_fchg&order=last_fchg.asc.nullsfirst&limit=${PER_RUN}`);
  let calls = 0;
  const errors = [];
  for (const h of hubs) {
    try {
      calls += await pollHub(h, Date.now());
    } catch (e) {
      errors.push(`${h.name}: ${String(e).slice(0, 120)}`);
      await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: String(e).slice(0, 200) }, { Prefer: "return=minimal" });
    }
  }
  const days = [parisDate(-1), parisDate(0)];
  const hubRows = await rest("GET", "at_hubs?select=name,eva,station&eva=not.is.null");
  const evaName = new Map(hubRows.map((h) => [h.eva, [...new Set([deNorm(h.name), deNorm(h.station || "")].filter(Boolean))]]));
  const plan = [];
  const since = new Date(Date.now() - 12 * 3600000).toISOString();
  const evas = [...evaName.keys()].join(",");
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `de_plan?eva=in.(${evas})&day=in.(${days.join(",")})&or=(dp_pt.gte.%22${since}%22,ar_pt.gte.%22${since}%22)&select=eva,cat,num,ar_pt,dp_pt,ar_ct,dp_ct,pp,cp,cs&order=eva,sid&limit=1000&offset=${off}`);
    for (const p of page)
      plan.push({ ...p, hubs: evaName.get(p.eva) || [] });
    if (page.length < 1000)
      break;
  }
  const now = Math.floor(Date.now() / 1000);
  const trains = [];
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `trains?country=eq.at&service_date=in.(${days.join(",")})&select=id,service_date,type,number,stops,delay_min&order=id&limit=1000&offset=${off}`);
    for (const r of page) {
      const st = r.stops || [];
      if (st.length < 2)
        continue;
      const a = fastEpoch(r.service_date, st[0].dep || st[0].arr), b = fastEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
      if (now >= a - 3 * 3600 && now <= b + 7200 + (r.delay_min || 0) * 60)
        trains.push(r);
    }
    if (page.length < 1000)
      break;
  }
  const updates = germanUpdates(trains, plan, now, { catOf: atCategory, keepNumbers: true });
  let written = 0;
  for (let i = 0;i < updates.length; i += 300)
    written += await rest("POST", "rpc/apply_at_updates", { payload: updates.slice(i, i + 300) });
  return { kind: "rt", hubs: hubs.map((h) => h.name), calls, planRows: plan.length, candidates: trains.length, written, errors, ms: Date.now() - t0 };
}
Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && await rest("POST", "rpc/cron_token_ok", { t: token });
  if (!ok)
    return json({ error: "forbidden" }, 403);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    if (kind === "rt" && (!DB_ID || !DB_KEY))
      return json({ error: "DB_CLIENT_ID / DB_API_KEY not set" }, 500);
    const out = kind === "schedule" ? await schedule() : kind === "preview" ? await preview() : await realtime();
    console.log(JSON.stringify(out).slice(0, 2000));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
