import { SITE_URL } from "@/lib/site";

// Rules for search engines: /robots.txt
// Train pages (/voz/…) exist only for one travel day and are not indexed: bots need not load them.
// SEO-tool crawlers bring no visitors but load thousands of pages, each one a server render (Vercel Active CPU):
// they are asked to stay away (24.11.2026). Google, Bing and the others keep full access.
const NO_CRAWL = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "Bytespider", "DataForSeoBot", "BLEXBot", "barkrowler", "SeekportBot", "serpstatbot"];
// The share picture of a train page (/train/…/opengraph-image) is drawn on the server, the most expensive thing
// the site renders. It is for LinkedIn, WhatsApp, X… when someone shares a train, not for search results, but Google
// and Bing fetched thousands of them (28.11.2026: 3 h 17 min of the free plan's 4 h of Vercel Active CPU used).
// Search engines are asked to skip it; share previews still get it. A crawler follows only its own group of rules,
// so the search engines' group repeats the general ones.
const SEARCH = ["Googlebot", "Googlebot-Image", "bingbot"];
const PRIVATE = ["/prijava", "/voz/"];
export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: SEARCH, allow: "/", disallow: [...PRIVATE, "/train/*/*/opengraph-image"] },
      { userAgent: NO_CRAWL, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
