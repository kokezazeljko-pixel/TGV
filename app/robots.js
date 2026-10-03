import { SITE_URL } from "@/lib/site";

// Rules for search engines: /robots.txt
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/prijava"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
