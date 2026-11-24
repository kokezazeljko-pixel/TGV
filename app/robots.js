import { SITE_URL } from "@/lib/site";

// Rules for search engines: /robots.txt
// Train pages (/voz/…) exist only for one travel day and are not indexed: bots need not load them.
// SEO-tool crawlers bring no visitors but load thousands of pages, each one a server render (Vercel Active CPU):
// they are asked to stay away (24.11.2026). Google, Bing and the others keep full access.
const NO_CRAWL = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "Bytespider", "DataForSeoBot", "BLEXBot", "barkrowler", "SeekportBot", "serpstatbot"];
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/prijava", "/voz/"] }, { userAgent: NO_CRAWL, disallow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
