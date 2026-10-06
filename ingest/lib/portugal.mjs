// Portugal (CP – Comboios de Portugal): official timetable (GTFS on publico.cp.pt). CP has no open live data yet,
// so Portuguese trains are shown from the timetable only (like Luxembourg), with passengers asked to report.
// Kept: Alfa Pendular (AP) and Intercidades (IC); left out: InterRegional, Regional and the urban lines.
import { unzip, eachLine } from "./spain.mjs";
import { hhmm } from "./util.mjs";

export const PT_STATIC_URL = "https://publico.cp.pt/gtfs/gtfs.zip";
const PT_TYPES = { AP: "Alfa Pendular", IC: "Intercidades" };
export const detectPortugueseType = (route = {}) => String(route.route_type).trim() === "2" ? PT_TYPES[String(route.route_short_name || "").trim().toUpperCase()] || null : null;

// The feed writes names without accents ("Porto Campanha", "Lisboa Santa Apolonia"): the stations the
// long-distance trains use get their real names back
const PT_NAMES = {
  "Porto Campanha": "Porto Campanhã", "Lisboa Santa Apolonia": "Lisboa Santa Apolónia", "Vila Nova de Gaia - Devesas": "Vila Nova de Gaia",
  "Santarem": "Santarém", "Guimaraes": "Guimarães", "Evora": "Évora", "Covilha": "Covilhã", "Tunes": "Tunes",
  "Vila Franca de Xira": "Vila Franca de Xira", "Setubal": "Setúbal", "Pinhal Novo": "Pinhal Novo", "Grandola": "Grândola",
  "Funcheira": "Funcheira", "Albufeira - Ferreiras": "Albufeira-Ferreiras", "Loule": "Loulé", "Fundao": "Fundão",
  "Abrantes": "Abrantes", "Pampilhosa": "Pampilhosa", "Mangualde": "Mangualde", "Nelas": "Nelas", "Celorico da Beira": "Celorico da Beira",
  "Sete Rios": "Lisboa Sete Rios", "Entrecampos": "Lisboa Entrecampos", "Oriente": "Lisboa Oriente", "Lisboa - Oriente": "Lisboa Oriente",
  "Coimbra B": "Coimbra-B", "Coimbra-B": "Coimbra-B", "Casa Branca": "Casa Branca", "Agua de Peixes": "Água de Peixes",
  "Vila Real Santo Antonio": "Vila Real de Santo António", "Torre das Vargens": "Torre das Vargens", "Ponte de Sor": "Ponte de Sôr",
  "Portalegre": "Portalegre", "Elvas": "Elvas", "Marvao-Beira": "Marvão-Beirã", "Sao Bento": "São Bento", "Porto Sao Bento": "Porto São Bento",
  "Valenca": "Valença", "Famalicao": "Famalicão", "Alcacovas": "Alcáçovas", "Mortagua": "Mortágua", "Santa Comba Dao": "Santa Comba Dão",
  "Macainhas": "Maçainhas", "Chao de Macas - Fatima": "Chão de Maçãs-Fátima", "Vila Velha de Rodao": "Vila Velha de Ródão",
  "Sao Joao das Craveiras": "São João das Craveiras", "Fernando Po": "Fernando Pó", "Ancora-Praia": "Âncora-Praia", "Poceirao": "Poceirão",
  "Pegoes": "Pegões", "Granja do Ulmeiro - Alfarelos": "Alfarelos", "Belmonte - Manteigas": "Belmonte-Manteigas", "Messines - Alte": "Messines-Alte",
  "Ermidas - Sado": "Ermidas-Sado", "Santa Clara - Saboia": "Santa Clara-Sabóia", "Amoreiras - Odemira": "Amoreiras-Odemira", "Viana do Castelo": "Viana do Castelo", "Regua": "Régua", "Pocinho": "Pocinho", "Tua": "Tua",
};
export const ptStopName = (raw = "") => { const n = raw.trim().replace(/\s+/g, " "); return PT_NAMES[n] || n; };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// zip (Uint8Array) -> rows for the trains table (country "pt") for the given days (YYYY-MM-DD)
export function buildPortugueseSchedule(zip, dates, inflateRaw) {
  const read = unzip(zip, inflateRaw);
  const ymd = (iso) => iso.replaceAll("-", "");
  const routes = new Map();
  eachLine(read("routes.txt"), (r) => { const type = detectPortugueseType(r); if (type) routes.set(r.route_id, type); });
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
    if (runs.length) trips.set(r.trip_id, { type, id: r.trip_id, number: (r.trip_short_name || r.trip_id.split("_")[0]).trim(), runs, stops: [] });
  }, (id) => routes.has(id));
  eachLine(read("stop_times.txt"), (r) => {
    const t = trips.get(r.trip_id);
    if (t) t.stops.push({ seq: Number(r.stop_sequence), id: r.stop_id, arr: r.arrival_time || null, dep: r.departure_time || null });
  }, (id) => trips.has(id));
  const need = new Set(); for (const t of trips.values()) for (const s of t.stops) need.add(s.id);
  const stops = new Map();
  eachLine(read("stops.txt"), (r) => stops.set(r.stop_id, r), (id) => need.has(id));
  const out = [];
  for (const t of trips.values()) {
    if (t.stops.length < 2) continue;
    t.stops.sort((a, b) => a.seq - b.seq);
    const st = t.stops.map((s) => {
      const r = stops.get(s.id) || {};
      const lat = parseFloat(r.stop_lat), lon = parseFloat(r.stop_lon);
      return { ...s, name: ptStopName(r.stop_name || s.id), time: hhmm(s.dep || s.arr), delay: 0,
        ...(Number.isFinite(lat) ? { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 } : {}) };
    });
    for (const d of t.runs) out.push({
      id: `${d}_pt_${t.id}`, trip_id: t.id, service_date: d, country: "pt",
      number: t.number, type: t.type, origin: st[0].name, destination: st[st.length - 1].name,
      dep: hhmm(st[0].dep || st[0].arr), arr: hhmm(st[st.length - 1].arr || st[st.length - 1].dep), stops: st,
    });
  }
  return out;
}
