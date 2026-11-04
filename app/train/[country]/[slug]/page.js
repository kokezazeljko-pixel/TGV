import Link from "next/link";
import { notFound } from "next/navigation";
import TrainLive from "@/components/TrainLive";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { COUNTRIES, PAGE_LANG, COUNTRY_NAME, TP, fill, parseTrainSlug, typeSlug, trainPageHref, shortName } from "@/lib/trainpage";

// One lasting page per train number, for search engines ("TGV 8702 retard", "ICE 597 Verspätung").
// Pages are made when first asked for and kept for 7 days (one Vercel "ISR write" per page per week);
// today's delay is loaded in the browser (TrainLive), so it is always current.
export const revalidate = 604800;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

const SOURCE = { fr: "SNCF", ch: "opentransportdata.swiss", be: "SNCB / NMBS", nl: "NS / NDOV", lu: "CFL / mobiliteit.lu", es: "Renfe", pt: "CP", de: "Deutsche Bahn", at: "ÖBB / DB" };

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

const names = (tr, lang) => {
  const n = `${tr.type} ${tr.number}`, r = `${shortName(tr.origin)} – ${shortName(tr.destination)}`;
  return { n, r, lang, L: TP[lang] || TP.en };
};

export async function generateMetadata({ params }) {
  const { country, slug } = await params;
  const tr = await load(country, slug);
  if (!tr) return { title: "Train not found", robots: { index: false } };
  const { n, r, L } = names(tr, PAGE_LANG[country]);
  const url = trainPageHref(country, tr.type, tr.number);
  return {
    title: fill(L.title, { n, r }),
    description: fill(L.desc, { n, r }),
    alternates: { canonical: url },
    openGraph: { title: fill(L.title, { n, r }), description: fill(L.desc, { n, r }), url, type: "website" },
  };
}

export default async function TrainNumberPage({ params }) {
  const { country, slug } = await params;
  const tr = await load(country, slug);
  if (!tr) notFound();
  const lang = PAGE_LANG[country];
  const { n, r, L } = names(tr, lang);
  const w = tr.week;
  const stops = tr.stops || [];
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  return (
    <article lang={lang}>
      <Link href="/" className="back">← Train Punctuality</Link>
      <div className="thead">
        <div>
          <h1>{n}</h1>
          <p>{shortName(tr.origin)} → {shortName(tr.destination)} · {tr.dep} – {tr.arr} · {COUNTRY_NAME[lang]?.[country] || country}</p>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <TrainLive country={country} type={tr.type} number={tr.number} lang={lang} />

          <section className="card">
            <h3>{L.week}</h3>
            {w && w.live_runs > 0 ? (
              <>
                <table className="tpweek">
                  <tbody>
                    <tr><td>{L.runs}</td><td className="num">{w.live_runs}</td></tr>
                    <tr><td>{L.onTime}</td><td className="num">{w.on_time} ({pct(w.on_time, w.live_runs)} %)</td></tr>
                    <tr><td>{L.late15}</td><td className="num">{w.late15}</td></tr>
                    {w.cancelled > 0 && <tr><td>{L.cancelled}</td><td className="num">{w.cancelled}</td></tr>}
                    {w.avg_delay != null && <tr><td>{L.avg}</td><td className="num">{Number(w.avg_delay).toLocaleString(lang)} min</td></tr>}
                    {w.max_delay != null && <tr><td>{L.max}</td><td className="num">{w.max_delay} min</td></tr>}
                  </tbody>
                </table>
                <p className="muted small">{w.first_day} – {w.last_day}</p>
              </>
            ) : <p className="muted">{L.weekNone}</p>}
            <p className="small">{L.weekPaid} <Link href="/">{L.weekPaidLink} →</Link></p>
          </section>
        </div>

        <div className="col">
          <section className="card">
            <h2 style={{ fontSize: "1.15em", marginTop: 0 }}>{L.stops}</h2>
            <p>{fill(L.about, { n, o: shortName(tr.origin), d: shortName(tr.destination), dep: tr.dep, arr: tr.arr, k: stops.length })}</p>
            <table className="tpstops">
              <thead><tr><th>{L.station}</th><th className="num">{L.time}</th></tr></thead>
              <tbody>
                {stops.map((s, i) => <tr key={i}><td>{s.name}</td><td className="num">{s.time}</td></tr>)}
              </tbody>
            </table>
            <p className="muted small">{fill(L.source, { s: SOURCE[country] || "" })}</p>
          </section>
        </div>
      </div>
    </article>
  );
}
