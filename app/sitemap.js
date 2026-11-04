import { SITE_URL } from "@/lib/site";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { trainPageHref } from "@/lib/trainpage";

// Sitemap for search engines: /sitemap.xml
// The day pages (/voz/…) are left out on purpose: each one exists only for its travel day.
// Instead every train number has a lasting page (/train/<country>/<type>-<number>), listed here.
// Rebuilt once a day (one Vercel "ISR write").
export const revalidate = 86400;

async function trainPages() {
  if (!isConfigured) return [];
  // the database sends at most 1000 rows per request: read the list in pages
  const sb = getServerClient(), data = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data: part, error } = await sb.rpc("train_page_list").range(from, from + 999);
    if (error || !part) break;
    data.push(...part);
    if (part.length < 1000) break;
  }
  return data.map((r) => ({ url: `${SITE_URL}${trainPageHref(r.country, r.type, r.number)}`, lastModified: new Date(r.last_day + "T12:00:00Z"), changeFrequency: "daily", priority: 0.6 }));
}

export default async function sitemap() {
  return [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/rekordi`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date("2026-10-03"), changeFrequency: "yearly", priority: 0.3 },
    ...(await trainPages()),
  ];
}
