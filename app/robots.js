import { SITE_URL } from "@/lib/site";

// Rules for search engines: /robots.txt
// Train pages (/voz/…) exist only for one travel day and are not indexed: bots need not load them.
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/prijava", "/voz/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
