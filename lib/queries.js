import { TRAIN_FIELDS } from "@/lib/format";

// A TGV Lyria crossing the border is in both the French and the Swiss data: on the combined map keep one (the French one)
function dedupe(rows) {
  const fr = new Set(rows.filter((r) => r.country === "fr").map((r) => r.number));
  return rows.filter((r) => r.country !== "ch" || !/TGV/.test(r.type) || !fr.has(r.number));
}

// Supabase returns at most 1000 rows per request, so trains are read in pages.
// country: "fr", "ch" or "all" (both)
export async function fetchTrainsForDay(sb, day, country = "all") {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("trains").select(TRAIN_FIELDS).eq("service_date", day);
    if (country !== "all") q = q.eq("country", country);
    const { data, error } = await q.order("dep").order("id").range(from, from + 999);
    if (error) return { data: all, error };
    all.push(...data);
    if (data.length < 1000) return { data: country === "all" ? dedupe(all) : all, error: null };
  }
}

// Only the trains whose delays changed after `since` (ISO time): keeps the minute-by-minute refresh small
export async function fetchTrainsUpdatedSince(sb, day, country, since) {
  let q = sb.from("trains").select(TRAIN_FIELDS).eq("service_date", day).gt("rt_updated_at", since);
  if (country !== "all") q = q.eq("country", country);
  const { data, error } = await q.limit(2000);
  return { data: data || [], error };
}

export async function fetchCommentCounts(sb, day) {
  const { data } = await sb.from("comments_feed").select("train_id").eq("service_date", day).limit(1000);
  const counts = {};
  for (const c of data || []) counts[c.train_id] = (counts[c.train_id] || 0) + 1;
  return counts;
}
