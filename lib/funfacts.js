// Fun facts / records of the last 7 full days (free for everyone). The database works them out once a day
// (refresh_fun_facts: top 5 per category, for Europe = "all" and each country) and keeps one small row.
// Used by the cards under the map (components/FunFacts.js, first of each list) and the page /rekordi (all five).
import { getBrowserClient } from "@/lib/supabase";

export const FF_CATS = [
  ["station_best", "ffStationBest", "ok"],
  ["station_worst", "ffStationWorst", "bad"],
  ["train_worst", "ffTrainWorst", "bad"],
  ["route_busy", "ffRouteBusy", "acc"],
  ["route_best", "ffRouteBest", "ok"],
  ["route_worst", "ffRouteWorst", "bad"],
];
export const FF_SITE = "trainpunctuality.com";
export const ffClean = (s) => String(s || "").replace(/ Hall \d.*$/, "");

let cache = null, pending = null; // read once per visit
export function loadFunFacts() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const sb = getBrowserClient();
  if (!sb) return Promise.resolve(null);
  pending = sb.rpc("get_fun_facts").then(({ data, error }) => {
    pending = null;
    if (error || !data?.facts) return null;
    // older single-record form (one object per category) is read as a list of one
    for (const f of Object.values(data.facts)) for (const k of Object.keys(f)) if (!Array.isArray(f[k])) f[k] = [f[k]];
    cache = data;
    return data;
  });
  return pending;
}

// One record -> what the page shows: title, details, its country, and the station name when it is a station
export function ffDescribe(cat, x, t, num) {
  if (cat === "station_best" || cat === "station_worst")
    return { title: ffClean(x.name), sub: [t("ffOnTime", num(x.ontime)), t("ffStops", num(x.n))], country: x.country, station: ffClean(x.name) };
  if (cat === "train_worst")
    return { title: `${x.type} ${x.number}`, sub: [`${ffClean(x.o)} – ${ffClean(x.de)}`, t("ffLateDays", x.late_days, x.days), t("ffUsually", num(Math.round(x.med)))], country: x.country };
  if (cat === "route_busy")
    return { title: `${ffClean(x.a)} – ${ffClean(x.b)}`, sub: [t("ffPerDay", num(x.per_day))], country: x.country };
  return { title: `${ffClean(x.a)} – ${ffClean(x.b)}`, sub: [t("ffOnTime", num(x.ontime)), t("ffAvg", num(x.avgd)), t("ffTrains", num(x.n))], country: x.country };
}

export function ffRange(data, loc) {
  const day = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(loc, { day: "numeric", month: "short" });
  return `${day(data.from)} – ${day(data.to)}`;
}

// Share sheet on phones, copy to the clipboard elsewhere; true when the text was copied
export async function ffShare(title, text, path = "/") {
  const url = `https://${FF_SITE}${path}`;
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return false; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return true;
  } catch { return false; }
}
