import { notFound } from "next/navigation";
import StationPageBody from "@/components/StationPageBody";
import { getServerClient } from "@/lib/supabase";
import { COUNTRIES, PAGE_LANG, fill } from "@/lib/trainpage";
import { SP, stationName, stationPageHref } from "@/lib/stationpage";
import { findStation } from "@/lib/stations-server";

// One lasting page per busy station (about 10 trains a day or more), for searches like "Köln Hbf Verspätung".
// Rendered on each visit (no ISR cache, so no Vercel "ISR writes"): today's trains with their delays at that moment.
// The station list stays an hour in memory; a view costs one database call (station_info, ~10 ms).
export const dynamic = "force-dynamic";

// minutes since midnight and "HH:MM" in the station's own time
function clock(country) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: country === "pt" ? "Europe/Lisbon" : "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { min: +p.hour * 60 + +p.minute, hm: `${p.hour}:${p.minute}` };
}

async function load(country, slug) {
  if (!COUNTRIES.includes(country)) return null;
  const s = await findStation(country, slug);
  if (!s) return null;
  const { data } = await getServerClient().rpc("station_info", { p_country: country, p_name: s.name });
  if (!data) return null;
  return { ...data, now: clock(country) };
}

export async function generateMetadata({ params }) {
  const { country, slug } = await params;
  const st = await load(country, slug);
  if (!st) return { title: "Station not found", robots: { index: false } };
  const v = { s: stationName(st.name) };
  const local = SP[PAGE_LANG[country]];
  const title = fill(SP.en.title, v) + (local && local !== SP.en ? ` (${local.kw})` : "");
  const description = fill(SP.en.desc, v) + (local && local !== SP.en ? " " + fill(local.desc, v) : "");
  const url = stationPageHref(country, st.name);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function StationPage({ params }) {
  const { country, slug } = await params;
  const st = await load(country, slug);
  if (!st) notFound();
  return <StationPageBody st={st} />;
}
