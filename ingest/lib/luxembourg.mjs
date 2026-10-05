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
