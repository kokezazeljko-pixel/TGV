import { TRAIN_FIELDS } from "@/lib/format";

// A train crossing the border can be in two countries' data (TGV Lyria: France + Switzerland,
// Paris–Brussels trains: France + Belgium): on the combined map keep one (the French one)
// International trains in the Dutch data (Eurostar, EuroCity, ICE, night trains) are dropped when another country has them.
const NL_INT = new Set(["Eurostar", "EC", "ECD", "ICE", "Night train"]);
// Luxembourg data also has the TGV to Paris (SNCF) and the IC to Brussels (SNCB): keep those countries' version
const LU_INT = new Set(["TGV", "IC", "EC", "ICE"]);
const DE_VIA_CH = new Set(["EC", "Railjet", "Night train"]);
// Spanish and Portuguese trains never run into those countries, so their numbers never count as "the same train" there.
// ÖBB lists some night trains twice: the Nightjet and its coach section (NJ 492 and 40490) with the same route and times.
// One of them is shown (the one with the shorter number).
function oneSection(rows) {
  const key = (r) => [r.type, r.origin, r.destination, r.dep, r.arr].join("|");
  const best = new Map();
  for (const r of rows) if (r.country === "at") {
    const k = key(r), b = best.get(k);
    if (!b || (r.number || "").length < (b.number || "").length || ((r.number || "").length === (b.number || "").length && (r.number || "") < (b.number || ""))) best.set(k, r);
  }
  return rows.filter((r) => r.country !== "at" || best.get(key(r)) === r);
}
function dedupe(rows) {
  rows = oneSection(rows);
  const fr = new Set(rows.filter((r) => r.country === "fr").map((r) => r.number));
  const twin = (r) => (r.country === "ch" && /TGV/.test(r.type)) || (r.country === "be" && r.type === "EC");
  const kept = rows.filter((r) => !(twin(r) && fr.has(r.number)));
  // German train numbers often equal unrelated Swiss, Dutch or Belgian ones: a German train counts only with the same type
  const FAR = new Set(["es", "pt", "de", "at"]);
  const deTyped = new Set(kept.filter((r) => r.country === "de" && r.number).map((r) => r.type + "|" + r.number));
  const other = new Set(kept.filter((r) => r.country !== "nl" && !FAR.has(r.country)).map((r) => r.number));
  const kept2 = kept.filter((r) => !(r.country === "nl" && NL_INT.has(r.type) && (other.has(r.number) || deTyped.has(r.type + "|" + r.number))));
  const notLu = new Set(kept2.filter((r) => r.country !== "lu" && !FAR.has(r.country)).map((r) => r.number));
  const kept3 = kept2.filter((r) => !(r.country === "lu" && LU_INT.has(r.type) && notLu.has(r.number)));
  // Germany: the ICE to Brussels, Amsterdam and Switzerland is kept from the German data (DB knows it best);
  // the TGV Paris–Frankfurt/Stuttgart/München from the French data, EuroCity and Railjet via Switzerland from the Swiss data
  const frTyped = new Set(kept3.filter((r) => r.country === "fr").map((r) => r.number));
  const chTyped = new Set(kept3.filter((r) => r.country === "ch").map((r) => r.type + "|" + r.number));
  const atTyped = new Set(kept3.filter((r) => r.country === "at" && r.number).map((r) => r.type + "|" + r.number));
  return kept3.filter((r) => !(r.country === "de" && r.type === "TGV" && frTyped.has(r.number)) && !(r.country === "de" && DE_VIA_CH.has(r.type) && chTyped.has(r.type + "|" + r.number))
    && !(r.country !== "de" && r.type === "ICE" && deTyped.has("ICE|" + r.number))
    // ÖBB trains (Railjet, EuroCity, Nightjet) also in the German or Swiss data are kept from the Austrian data (the ICE stays German)
    && !((r.country === "de" || r.country === "ch") && r.type !== "ICE" && atTyped.has(r.type + "|" + r.number)));
}

// Supabase returns at most 1000 rows per request, so trains are read in pages.
// country: "fr", "ch", "be", "nl", "lu", "es", "pt", "de", "at" or "all"
export async function fetchTrainsForDay(sb, day, country = "all") {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("trains").select(TRAIN_FIELDS).eq("service_date", day);
    if (country !== "all") q = q.eq("country", country);
    const { data, error } = await q.order("dep").order("id").range(from, from + 999);
    if (error) return { data: all, error };
    all.push(...data);
    if (data.length < 1000) return { data: country === "all" ? dedupe(all) : country === "at" ? oneSection(all) : all, error: null };
  }
}

// Only the trains whose delays changed after `since` (ISO time): keeps the minute-by-minute refresh small.
// Also in pages: all countries together change more than 1000 trains a minute.
export async function fetchTrainsUpdatedSince(sb, day, country, since) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("trains").select(TRAIN_FIELDS).eq("service_date", day).gt("rt_updated_at", since);
    if (country !== "all") q = q.eq("country", country);
    const { data, error } = await q.order("id").range(from, from + 999);
    if (error) return { data: all, error };
    all.push(...data);
    if (data.length < 1000) return { data: all, error: null };
  }
}

// Official notices from the railways still in their feed (refreshed every 5 minutes, so older than 30 min = gone)
const alertsSince = () => new Date(Date.now() - 30 * 60000).toISOString();
export async function fetchAlertTrainIds(sb) {
  const { data } = await sb.from("alerts").select("train_ids").gt("updated_at", alertsSince()).limit(2000);
  return new Set((data || []).flatMap((a) => a.train_ids));
}
export async function fetchAlertsForTrain(sb, trainId) {
  const { data } = await sb.from("alerts").select("id,country,header,description,header_tr,description_tr,orig_lang,cause,url,active_from,active_to")
    .contains("train_ids", [trainId]).gt("updated_at", alertsSince()).order("active_from", { ascending: false }).limit(20);
  return data || [];
}

export async function fetchCommentCounts(sb, day) {
  const { data } = await sb.from("comments_feed").select("train_id").eq("service_date", day).limit(1000);
  const counts = {};
  for (const c of data || []) counts[c.train_id] = (counts[c.train_id] || 0) + 1;
  return counts;
}
