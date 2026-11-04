import { notFound } from "next/navigation";
import TrainPageBody from "@/components/TrainPageBody";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { COUNTRIES, PAGE_LANG, TP, fill, parseTrainSlug, typeSlug, trainPageHref, shortName } from "@/lib/trainpage";

// One lasting page per train number, for search engines ("ICE 597 delay", "TGV 8702 retard").
// Pages are made when first asked for and kept for 7 days (one Vercel "ISR write" per page per week);
// today's delay is loaded in the browser (TrainLive), so it is always current.
// The text is English (like the rest of the site) and follows the language the visitor picks;
// the title also carries the search words of the train's country ("Verspätung heute").
export const revalidate = 604800;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

async function load(country, slug) {
  if (!isConfigured || !COUNTRIES.includes(country)) return null;
  const p = parseTrainSlug(slug);
  if (!p) return null;
  const sb = getServerClient();
  const { data: info } = await sb.rpc("train_page_info", { p_country: country, p_number: p.number });
  const row = (info || []).find((r) => typeSlug(r.type) === p.type);
  if (!row) return null;
  const { data: week } = await sb.rpc("train_week_summary", { p_country: country, p_type: row.type, p_number: p.number });
  return { ...row, number: p.number, country, week: (week || [])[0] || null };
}

export async function generateMetadata({ params }) {
  const { country, slug } = await params;
  const tr = await load(country, slug);
  if (!tr) return { title: "Train not found", robots: { index: false } };
  const n = `${tr.type} ${tr.number}`, r = `${shortName(tr.origin)} – ${shortName(tr.destination)}`;
  const local = TP[PAGE_LANG[country]];
  const title = fill(TP.en.title, { n, r }) + (local && local !== TP.en ? ` (${local.kw})` : "");
  const description = fill(TP.en.desc, { n, r }) + (local && local !== TP.en ? " " + fill(local.desc, { n, r }) : "");
  const url = trainPageHref(country, tr.type, tr.number);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function TrainNumberPage({ params }) {
  const { country, slug } = await params;
  const tr = await load(country, slug);
  if (!tr) notFound();
  return <TrainPageBody tr={tr} />;
}
