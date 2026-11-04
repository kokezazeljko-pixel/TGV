"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
import { COUNTRY_NAME, fill, shortName, trainPageHref } from "@/lib/trainpage";
import { RP } from "@/lib/routepage";

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// The route page in the site language the visitor chose (the server sends English, which search engines read)
export default function RoutePageBody({ r }) {
  const { lang } = useLang();
  const L = RP[lang] || RP.en;
  const loc = LOCALES[lang] || "en-GB";
  const o = shortName(r.origin), d = shortName(r.destination);
  const trains = r.trains || [];
  const p = pct(r.on_time, r.measured);

  return (
    <article>
      <Link href="/" className="back">← Train Punctuality</Link>
      <div className="thead">
        <div>
          <h1>{o} → {d}</h1>
          <p>{fill(L.sub, { n: trains.length })} · {(COUNTRY_NAME[lang] || COUNTRY_NAME.en)[r.country] || r.country}
            {r.back && <> · <Link href={r.back} prefetch={false}>{L.back} ⇄</Link></>}</p>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="card">
            <h3>{L.week}</h3>
            {r.measured > 0 ? (
              <>
                <table className="tpweek">
                  <tbody>
                    <tr><td>{L.runs}</td><td className="num">{r.measured}</td></tr>
                    <tr><td>{L.onTime}</td><td className="num"><b>{p} %</b></td></tr>
                    <tr><td>{L.late15}</td><td className="num">{r.late15}</td></tr>
                    {r.cancelled > 0 && <tr><td>{L.cancelled}</td><td className="num">{r.cancelled}</td></tr>}
                    {r.avg_delay != null && <tr><td>{L.avg}</td><td className="num">{Number(r.avg_delay).toLocaleString(loc)} min</td></tr>}
                  </tbody>
                </table>
                <p className="muted small">{r.first_day} – {r.last_day}</p>
              </>
            ) : <p className="muted">{L.none}</p>}
            <p className="small">{L.weekPaid} <Link href="/">{L.weekPaidLink} →</Link></p>
          </section>
        </div>

        <div className="col">
          <section className="card">
            <h2 style={{ fontSize: "1.15em", marginTop: 0 }}>{L.trains}</h2>
            <div className="ptable-wrap">
              <table className="tpstops">
                <thead><tr><th>{L.dep}</th><th>{L.arr}</th><th>{L.train}</th><th className="num">{L.punct}</th><th className="num">{L.avgShort}</th></tr></thead>
                <tbody>
                  {trains.map((t) => {
                    const named = /^\d+$/.test(t.number || "");
                    return (
                      <tr key={t.type + t.number + t.dep}>
                        <td className="num" style={{ textAlign: "left" }}>{t.dep}</td>
                        <td className="num" style={{ textAlign: "left" }}>{t.arr}</td>
                        <td>{named ? <Link href={trainPageHref(r.country, t.type, t.number)} prefetch={false}>{t.type} {t.number}</Link> : t.type}</td>
                        <td className="num">{t.measured ? `${t.on_time}/${t.measured}` : <span className="muted">{L.none}</span>}</td>
                        <td className="num">{t.avg_delay != null ? `${Number(t.avg_delay).toLocaleString(loc)} min` : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small">{L.note}</p>
          </section>
        </div>
      </div>
    </article>
  );
}
