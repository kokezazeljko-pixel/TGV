import { TRAIN_FIELDS } from "@/lib/format";

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
    if (data.length < 1000) return { data: all, error: null };
  }
}

export async function fetchCommentCounts(sb, day) {
  const { data } = await sb.from("comments_feed").select("train_id").eq("service_date", day).limit(1000);
  const counts = {};
  for (const c of data || []) counts[c.train_id] = (counts[c.train_id] || 0) + 1;
  return counts;
}
