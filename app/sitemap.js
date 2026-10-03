import { SITE_URL } from "@/lib/site";

// Sitemap for search engines: /sitemap.xml
// Train pages are left out on purpose: each one exists only for its travel day.
export default function sitemap() {
  return [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date("2026-10-03"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
