// Luxembourg (CFL): official timetable from the Administration des transports publics on data.public.lu
// (GTFS for the whole country, CC BY 4.0, new file every week). Realtime comes from the mobiliteit.lu API (key needed).
export const LU_DATASET_API = "https://data.public.lu/api/1/datasets/horaires-et-arrets-des-transport-publics-gtfs/";

// The zip has a new address every week (gtfs-20260930-20261212.zip): take the newest one that covers today
export async function latestLuxGtfsUrl(todayIso) {
  const res = await fetch(LU_DATASET_API, { headers: { "User-Agent": "train-punctuality-ingest/1.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`data.public.lu -> ${res.status}`);
  const zips = ((await res.json()).resources || []).filter((r) => /\.zip$/i.test(r.url || "") || r.format === "zip");
  const ymd = todayIso.replaceAll("-", "");
  const covers = (r) => { const m = /(\d{8})-(\d{8})/.exec(r.title || r.url || ""); return m && m[1] <= ymd && ymd <= m[2]; };
  const pick = (list) => list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  const best = pick(zips.filter(covers)) || pick(zips);
  if (!best) throw new Error("Nije pronađen luksemburški GTFS na data.public.lu");
  return best.url;
}

// CFL routes are named by category (routes.txt route_short_name): RE, RB, IC, TGV, TER.
// Kept: Regional-Express and the international trains; RB (stopping trains), buses and trams are left out.
const LU_CATS = { RE: "RE", IC: "IC", EC: "EC", TGV: "TGV", TER: "TER", ICE: "ICE" };
export const LU_AGENCIES = new Set(["11"]); // Chemins de Fer Luxembourgeois (trains); 171 = CFL buses
export function detectLuxType(route = {}) {
  if (String(route.route_type) !== "2" || !LU_AGENCIES.has(String(route.agency_id))) return null;
  return LU_CATS[(route.route_short_name || "").trim().toUpperCase()] || null;
}

// Stops in Luxembourg have ids starting 0001… / 0002…; 0003 = Belgium, 0004 = France, 0005 = Germany
export const isLuxStop = (id = "") => /^000[12]\d/.test(id);

// "Ettelbruck, Gare" -> "Ettelbruck", "Luxembourg, Gare Centrale" -> "Luxembourg", "Trier, Hauptbahnhof" -> "Trier Hbf"
export const luxStopName = (name = "") => name.replace(/,\s*Gare( Centrale)?$/i, "").replace(/,\s*Hauptbahnhof$/i, " Hbf").trim();

// Train numbers come zero-padded ("02800")
export const luxNumber = (n = "") => String(n).replace(/^0+(?=\d)/, "");

// ---- live data: mobiliteit.lu API (HAFAS ReST, key LU_API_KEY). Only departure boards are offered.
export const LU_API = "https://cdt.hafas.de/opendata/apiserver/";
// GTFS stop id "000200405060" = API stop 200405060 (Luxembourg, Gare Centrale); foreign stops (0003…, 0004…, 0005…) are not in the API
export const luxExt = (id = "") => (isLuxStop(id) ? String(id).replace(/^0+/, "") : null);
const luxEpoch = (date, time) => (date && time ? Math.round(Date.parse(`${date}T${time}${parisOffset(date)}`) / 1000) : null);
// "+02:00" in summer, "+01:00" in winter (Luxembourg = Paris time); exact enough around the switch nights
function parisOffset(date) {
  const d = new Date(date + "T12:00:00Z");
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(d));
  return `+0${h - 12}:00`;
}
// departure board (JSON) -> rows for the lu_rt table: one per train and station
export function parseLuxBoard(body, ext) {
  const out = [];
  for (const d of body?.Departure || []) {
    const num = luxNumber(d.ProductAtStop?.num || ""); if (!num) continue;
    const pt = luxEpoch(d.date, d.time); if (!pt) continue;
    let ct = luxEpoch(d.rtDate || d.date, d.rtTime);
    // mobiliteit.lu sometimes sends a wrong rtDate (9.10.2026: RE 5122 at Wasserbillig came with the next day's date,
    // shown as "+1450 min" instead of +10): the real time is the one closest to the planned time (within ±12 h)
    if (ct) ct += Math.round((pt - ct) / 86400) * 86400;
    out.push({ num, ext: d.mainMastExtId || ext, pt: new Date(pt * 1000).toISOString(), ct: ct ? new Date(ct * 1000).toISOString() : null,
      cancelled: d.cancelled === true, pf: d.rtPlatform?.text || d.platform?.text || null, pf_plan: d.platform?.text || null });
  }
  return out;
}
// trains (id, service_date, number, stops) + lu_rt rows -> payload for apply_rt_delays
export function luxUpdates(trains, rt, toEpoch, nowSec) {
  const byKey = new Map();
  for (const r of rt) byKey.set(`${r.num}|${r.ext}|${Math.round(Date.parse(r.pt) / 60000)}`, r);
  const updates = [];
  for (const tr of trains) {
    if (!tr.number) continue;
    let carry = null, matched = 0, cancelledHits = 0, originCancelled = false;
    const d = [];
    tr.stops.forEach((s, i) => {
      const ext = luxExt(s.id);
      const t = s.dep || s.arr;
      const r = ext && t && i < tr.stops.length - 1 ? byKey.get(`${tr.number}|${ext}|${Math.round(toEpoch(tr.service_date, t) / 60)}`) : null;
      let skipped = false, apf;
      if (r) {
        matched++;
        if (r.cancelled) { skipped = true; cancelledHits++; if (i === 0) originCancelled = true; }
        else if (r.ct) carry = (Date.parse(r.ct) - Date.parse(r.pt)) / 1000;
        else carry = carry ?? 0;
        if (r.pf && r.pf_plan && r.pf !== r.pf_plan) apf = r.pf;
      }
      const delay = Math.max(0, Math.round((carry ?? 0) / 60));
      d.push(apf ? [delay, skipped, apf] : [delay, skipped]);
    });
    if (!matched) continue;
    const cancelled = cancelledHits === matched && (matched >= 2 || originCancelled);
    let delay_min = d.length ? d[d.length - 1][0] : 0;
    for (let i = 0; i < tr.stops.length; i++) {
      const s = tr.stops[i]; if (d[i][1]) continue;
      if (toEpoch(tr.service_date, s.arr || s.dep) + d[i][0] * 60 >= nowSec) { delay_min = d[i][0]; break; }
    }
    updates.push({ id: tr.id, delay_min: cancelled ? 0 : delay_min, cancelled, d });
  }
  return updates;
}
