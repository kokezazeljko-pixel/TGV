import { notFound } from "next/navigation";
import RoutePageBody from "@/components/RoutePageBody";
import { getServerClient } from "@/lib/supabase";
import { COUNTRIES, PAGE_LANG, fill, shortName } from "@/lib/trainpage";
import { RP, routePageHref } from "@/lib/routepage";
import { findRoute } from "@/lib/routes-server";

// One lasting page per route (origin → destination of our trains, or a pair of busy stations on the way),
// for searches like "Paris Lyon train delay".
// Rendered on each visit (no ISR cache, so no Vercel "ISR writes"); the route list stays an hour in memory.
export const dynamic = "force-dynamic";

async function load(country, slug) {
  if (!COUNTRIES.includes(country)) return null;
  const r = await findRoute(country, slug);
  if (!r) return null;
  const sb = getServerClient();
  const { data } = r.kind === "pair"
    ? await sb.rpc("route_pair_info", { p_country: country, p_a: r.origin, p_b: r.destination })
    : await sb.rpc("route_page_info", { p_country: country, p_origin: r.origin, p_destination: r.destination });
  if (!data) return null;
  const back = await findRoute(country, slug.split("--").reverse().join("--"));
  return { ...data, back: back ? routePageHref(country, back.origin, back.destination) : null };
}

export async function generateMetadata({ params }) {
  const { country, slug } = await params;
  const r = await load(country, slug);
  if (!r) return { title: "Route not found", robots: { index: false } };
  const v = { o: shortName(r.origin), d: shortName(r.destination) };
  const local = RP[PAGE_LANG[country]];
  const title = fill(RP.en.title, v) + (local && local !== RP.en ? ` (${local.kw})` : "");
  const description = fill(RP.en.desc, v) + (local && local !== RP.en ? " " + fill(local.desc, v) : "");
  const url = routePageHref(country, r.origin, r.destination);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function RoutePage({ params }) {
  const { country, slug } = await params;
  const r = await load(country, slug);
  if (!r) notFound();
  return <RoutePageBody r={r} />;
}
