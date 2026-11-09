"use client";

import Link from "next/link";
import { useState } from "react";
import TrainMap from "@/components/TrainMap";
import { getGeo } from "@/lib/geo";
import TrainLive from "@/components/TrainLive";
import ShareTrain from "@/components/ShareTrain";
import { RP, routePageHref } from "@/lib/routepage";
import { useLang } from "@/components/LangProvider";
import { COUNTRY_NAME, TP, fill, shortName } from "@/lib/trainpage";

const SOURCE = { fr: "SNCF", ch: "opentransportdata.swiss", be: "SNCB / NMBS", nl: "NS / NDOV", lu: "CFL / mobiliteit.lu", es: "Renfe", pt: "CP", de: "Deutsche Bahn", at: "ÖBB / DB" };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
// The country map that shows the whole route (or the map of all countries for a train that leaves its own)
const routeMapFor = (train) => {
  const c = train.country || "fr", own = getGeo(c);
  if (own.fitsTrain(train)) return c;
  const placed = (g) => (train.stops || []).filter((s) => g.stopNode(s)).length;
  return placed(getGeo("all")) > placed(own) ? "all" : c;
};

// The lasting train page in the site language the visitor chose (English first, like the rest of the site).
// The server sends it in English, so that is also what search engines read.
export default function TrainPageBody({ tr }) {
  const { lang } = useLang();
  const L = TP[lang] || TP.en;
  const n = `${tr.type} ${tr.number}`;
  const w = tr.week;
  const stops = tr.stops || [];
  const loc = lang === "en" ? "en-GB" : lang;
  // Route map: today's run when there is one (it also shows where the train is now), else the timetable's stops
  const [live, setLive] = useState(null);
  const mapTrain = live || { id: `page-${tr.country}-${tr.type}-${tr.number}`, country: tr.country, type: tr.type, number: tr.number, origin: tr.origin, destination: tr.destination, stops };
  const canMap = stops.filter((s) => s.lat != null).length >= 2 || !!live;

  return (
    <>
      <Link href="/" className="back">← Train Punctuality</Link>
      <div className="thead">
        <div>
          <h1>{n}</h1>
          <p>{shortName(tr.origin)} → {shortName(tr.destination)} · {tr.dep} – {tr.arr} · {(COUNTRY_NAME[lang] || COUNTRY_NAME.en)[tr.country] || tr.country}</p>
          <p className="small"><Link href={routePageHref(tr.country, tr.origin, tr.destination)} prefetch={false}>{fill((RP[lang] || RP.en).all, { o: shortName(tr.origin), d: shortName(tr.destination) })} →</Link></p>
          <ShareTrain country={tr.country} type={tr.type} number={tr.number} />
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <TrainLive country={tr.country} type={tr.type} number={tr.number} lang={lang} onTrain={setLive} />

          {canMap && (
            <section className="card">
              <h3>{L.map}</h3>
              <TrainMap key={mapTrain.id} country={routeMapFor(mapTrain)} trains={live ? [live] : []} highlight={mapTrain} compact />
            </section>
          )}

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
                    {w.avg_delay != null && <tr><td>{L.avg}</td><td className="num">{Number(w.avg_delay).toLocaleString(loc)} min</td></tr>}
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
            <p className="muted small">{fill(L.source, { s: SOURCE[tr.country] || "" })}</p>
          </section>
        </div>
      </div>
    </>
  );
}
