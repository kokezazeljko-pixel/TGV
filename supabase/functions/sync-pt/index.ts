// GENERISANO iz source.mjs (bun build source.mjs --target=node --format=esm --external node:* --outfile index.ts) – ne menjati ručno.
// source.mjs
import { inflateRawSync } from "node:zlib";

// ../../../ingest/lib/util.mjs
var TZ = "Europe/Paris";
function parisDate(offsetDays = 0, now = new Date) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
var hhmm = (hms) => {
  if (!hms)
    return null;
  const [h, m] = hms.split(":").map(Number);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// ../../../ingest/lib/spain.mjs
function unzip(buf, inflateRaw) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22;i >= Math.max(0, buf.length - 65557); i--)
    if (dv.getUint32(i, true) === 101010256) {
      e = i;
      break;
    }
  if (e < 0)
    throw new Error("not a zip file");
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  const td = new TextDecoder;
  for (let n = 0;n < count; n++) {
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[td.decode(buf.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return (name) => {
    const f = files[name];
    if (!f)
      return "";
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    return td.decode(f.method === 8 ? inflateRaw(data) : data);
  };
}
function eachLine(text, onRow, keep = null) {
  let start = 0, head = null;
  while (start < text.length) {
    let end = text.indexOf(`
`, start);
    if (end < 0)
      end = text.length;
    const line = text.slice(start, end).trimEnd();
    start = end + 1;
    if (!line)
      continue;
    if (!head) {
      head = line.replace(/^﻿/, "").split(",").map((h) => h.trim());
      continue;
    }
    if (keep && !keep(line.slice(0, line.indexOf(","))))
      continue;
    const v = line.split(",");
    const r = {};
    for (let k = 0;k < head.length; k++)
      r[head[k]] = (v[k] ?? "").trim();
    onRow(r);
  }
}

// ../../../ingest/lib/portugal.mjs
var PT_STATIC_URL = "https://publico.cp.pt/gtfs/gtfs.zip";
var PT_TYPES = { AP: "Alfa Pendular", IC: "Intercidades" };
var detectPortugueseType = (route = {}) => String(route.route_type).trim() === "2" ? PT_TYPES[String(route.route_short_name || "").trim().toUpperCase()] || null : null;
var PT_NAMES = {
  "Porto Campanha": "Porto Campanhã",
  "Lisboa Santa Apolonia": "Lisboa Santa Apolónia",
  "Vila Nova de Gaia - Devesas": "Vila Nova de Gaia",
  Santarem: "Santarém",
  Guimaraes: "Guimarães",
  Evora: "Évora",
  Covilha: "Covilhã",
  Tunes: "Tunes",
  "Vila Franca de Xira": "Vila Franca de Xira",
  Setubal: "Setúbal",
  "Pinhal Novo": "Pinhal Novo",
  Grandola: "Grândola",
  Funcheira: "Funcheira",
  "Albufeira - Ferreiras": "Albufeira-Ferreiras",
  Loule: "Loulé",
  Fundao: "Fundão",
  Abrantes: "Abrantes",
  Pampilhosa: "Pampilhosa",
  Mangualde: "Mangualde",
  Nelas: "Nelas",
  "Celorico da Beira": "Celorico da Beira",
  "Sete Rios": "Lisboa Sete Rios",
  Entrecampos: "Lisboa Entrecampos",
  Oriente: "Lisboa Oriente",
  "Lisboa - Oriente": "Lisboa Oriente",
  "Coimbra B": "Coimbra-B",
  "Coimbra-B": "Coimbra-B",
  "Casa Branca": "Casa Branca",
  "Agua de Peixes": "Água de Peixes",
  "Vila Real Santo Antonio": "Vila Real de Santo António",
  "Torre das Vargens": "Torre das Vargens",
  "Ponte de Sor": "Ponte de Sôr",
  Portalegre: "Portalegre",
  Elvas: "Elvas",
  "Marvao-Beira": "Marvão-Beirã",
  "Sao Bento": "São Bento",
  "Porto Sao Bento": "Porto São Bento",
  Valenca: "Valença",
  Famalicao: "Famalicão",
  Alcacovas: "Alcáçovas",
  Mortagua: "Mortágua",
  "Santa Comba Dao": "Santa Comba Dão",
  Macainhas: "Maçainhas",
  "Chao de Macas - Fatima": "Chão de Maçãs-Fátima",
  "Vila Velha de Rodao": "Vila Velha de Ródão",
  "Sao Joao das Craveiras": "São João das Craveiras",
  "Fernando Po": "Fernando Pó",
  "Ancora-Praia": "Âncora-Praia",
  Poceirao: "Poceirão",
  Pegoes: "Pegões",
  "Granja do Ulmeiro - Alfarelos": "Alfarelos",
  "Belmonte - Manteigas": "Belmonte-Manteigas",
  "Messines - Alte": "Messines-Alte",
  "Ermidas - Sado": "Ermidas-Sado",
  "Santa Clara - Saboia": "Santa Clara-Sabóia",
  "Amoreiras - Odemira": "Amoreiras-Odemira",
  "Viana do Castelo": "Viana do Castelo",
  Regua: "Régua",
  Pocinho: "Pocinho",
  Tua: "Tua"
};
var ptStopName = (raw = "") => {
  const n = raw.trim().replace(/\s+/g, " ");
  return PT_NAMES[n] || n;
};
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function buildPortugueseSchedule(zip, dates, inflateRaw) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const routes = new Map;
  eachLine(read("routes.txt"), (r) => {
    const type = detectPortugueseType(r);
    if (type)
      routes.set(r.route_id, type);
  });
  const active = new Map(dates.map((d) => [d, new Set]));
  eachLine(read("calendar.txt"), (r) => {
    for (const d of dates) {
      const wd = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()];
      if (r.start_date <= ymd(d) && ymd(d) <= r.end_date && r[wd] === "1")
        active.get(d).add(r.service_id);
    }
  });
  eachLine(read("calendar_dates.txt"), (r) => {
    for (const d of dates) {
      if (r.date !== ymd(d))
        continue;
      if (r.exception_type === "1")
        active.get(d).add(r.service_id);
      if (r.exception_type === "2")
        active.get(d).delete(r.service_id);
    }
  });
  const trips = new Map;
  eachLine(read("trips.txt"), (r) => {
    const type = routes.get(r.route_id);
    if (!type)
      return;
    const runs = dates.filter((d) => active.get(d).has(r.service_id));
    if (runs.length)
      trips.set(r.trip_id, { type, id: r.trip_id, number: (r.trip_short_name || r.trip_id.split("_")[0]).trim(), runs, stops: [] });
  }, (id) => routes.has(id));
  eachLine(read("stop_times.txt"), (r) => {
    const t = trips.get(r.trip_id);
    if (t)
      t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }, (id) => trips.has(id));
  const need = new Set;
  for (const t of trips.values())
    for (const s of t.stops)
      need.add(s.id);
  const stops = new Map;
  eachLine(read("stops.txt"), (r) => stops.set(r.stop_id, r), (id) => need.has(id));
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2)
      continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      return {
        ...s,
        name: ptStopName(r.stop_name || s.id),
        time: hhmm(s.dep || s.arr),
        delay: 0,
        ...Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}
      };
    });
    for (const d of t.runs)
      out.push({
        id: `${d}_pt_${t.id}`,
        trip_id: t.id,
        service_date: d,
        country: "pt",
        number: t.number,
        type: t.type,
        origin: st[0].name,
        destination: st[st.length - 1].name,
        dep: hhmm(st[0].dep || st[0].arr),
        arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep),
        stops: st
      });
  }
  return out;
}

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
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
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function schedule() {
  const dates = [parisDate(0), parisDate(1)];
  const res = await fetch(PT_STATIC_URL, { headers: UA });
  if (!res.ok)
    throw new Error(`cp gtfs -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildPortugueseSchedule(zip, dates, (d) => inflateRawSync(d));
  if (!rows.length)
    throw new Error("no trains found – nothing changed");
  for (let i = 0;i < rows.length; i += 400)
    await rest("POST", "trains?on_conflict=id", rows.slice(i, i + 400), { Prefer: "resolution=merge-duplicates,return=minimal" });
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.pt&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0;i < stale.length; i += 80) {
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
      removed += Math.min(80, stale.length - i);
    }
  }
  await rest("DELETE", `trains?country=eq.pt&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length, removed, bytes: zip.length };
}
Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !await rest("POST", "rpc/cron_token_ok", { t: token }))
    return json({ error: "forbidden" }, 403);
  try {
    const out = await schedule();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
