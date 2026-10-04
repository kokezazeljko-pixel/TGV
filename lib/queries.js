import { TRAIN_FIELDS } from "@/lib/format";

// Supabase returns at most 1000 rows per request, so trains are read in pages
export async function fetchTrainsForDay(sb, day, country = "fr") {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("trains").select(TRAIN_FIELDS).eq("service_date", day).eq("country", country).order("dep").order("id").range(from, from + 999);
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
