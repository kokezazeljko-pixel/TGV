// Pages rendered on each request (train, route and station pages) are kept by Vercel's CDN for a while, so a search
// engine or bot that loads the same page again does not run the server function each time (24.11.2026: the free plan's
// 4 hours of Active CPU were 75% used). The CDN cache is not ISR: it costs no ISR writes. These pages read no cookies,
// and today's delays on a train page are loaded in the browser, so a copy that is a little older shows the same thing.
// Vercel-CDN-Cache-Control is read only by Vercel's CDN; browsers still get Next's own Cache-Control.
const cdn = (s, swr) => [{ key: "Vercel-CDN-Cache-Control", value: `max-age=${s}, stale-while-revalidate=${swr}` }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: "/train/:country/:slug", headers: cdn(3600, 86400) },
      { source: "/train/:country/:slug/:image", headers: cdn(86400, 86400) }, // the share picture (opengraph-image…), the only address below a train page
      { source: "/route/:country/:slug", headers: cdn(3600, 86400) },
      { source: "/station/:country/:slug", headers: cdn(600, 3600) }, // today's departures are on the page
    ];
  },
};
export default nextConfig;
