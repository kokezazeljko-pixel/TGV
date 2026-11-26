// A database call for a page that must not turn a failure into "Not found".
// Until 26.11.2026 a page treated a failed call (a timeout while search engines crawl many pages at once) like a
// train or station that does not exist, and answered 404: Google listed 90 such pages as "Not found" (23–25.11),
// and with the CDN cache (next.config.mjs) a 404 could even be kept for a day. Now a failed call is retried once,
// then the page fails with a server error (5xx), which Google retries later and Vercel's CDN does not keep.
export async function rpcStrict(sb, fn, args) {
  let error;
  for (let i = 0; i < 2; i++) {
    const r = await sb.rpc(fn, args);
    if (!r.error) return r.data;
    error = r.error;
    if (i === 0) await new Promise((res) => setTimeout(res, 400));
  }
  throw Error(`${fn}: ${error?.message || "failed"}`);
}
