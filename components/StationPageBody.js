"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
import { COUNTRY_NAME, fill, shortName, trainPageHref } from "@/lib/trainpage";
import { SP, stationName } from "@/lib/stationpage";
import StationMap from "@/components/StationMap";

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const mins = (hm) => { const [h, m] = String(hm || "").split(":").map(Number); return isNaN(h) ? null : h * 60 + m; };
const SHOW = 30;

function status(t, L) {
  if (t.cancelled) return { cls: "s-gone", label: L.cancelled };
  if (!t.live || t.delay == null) return { cls: "s-sched", label: L.sched };
  const d = t.delay;
  if (d < 5) return { cls: "s-ok", label: d > 0 ? `+${d} min` : L.onTimeLbl };
  return { cls: d < 15 ? "s-warn" : "s-bad", label: `+${d} min` };
}

// The station page in the site language the visitor chose (the server sends English, which search engines read)
export default function StationPageBody({ st }) {
  const { lang } = useLang();
  const L = SP[lang] || SP.en;
  const loc = LOCALES[lang] || "en-GB";
  const name = stationName(st.name);
  const board = st.board || [];
  // from about an hour ago on (trains still on their way in, with their delay), earlier ones on request.
  // Times after midnight of yesterday's trains come first in the list and count as early morning.
  const idx = board.findIndex((t) => (mins(t.time) ?? 0) + (t.delay || 0) >= st.now.min - 60);
  const startAt = idx < 0 ? Math.max(0, board.length - SHOW) : idx; // late at night: the last trains of the day
  const [earlier, setEarlier] = useState(false);
  const [all, setAll] = useState(false);
  const from = earlier ? 0 : startAt;
  const rest = board.slice(from);
  const rows = all ? rest : rest.slice(0, SHOW);
  const p = pct(st.on_time, st.measured);
  const hasPf = board.some((t) => t.pf);

  return (
    <article>
      <Link href="/" className="back">← Train Punctuality</Link>
      <div className="thead">
        <div>
          <h1>{name}</h1>
          <p>{fill(L.sub, { c: (COUNTRY_NAME[lang] || COUNTRY_NAME.en)[st.country] || st.country, n: Math.max(1, Math.round((st.trains || 0) / 7)) })}</p>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="card">
            <h2 style={{ fontSize: "1.15em", marginTop: 0 }}>{L.today}</h2>
            {!earlier && from > 0 && <p className="small"><button type="button" className="linkbtn" onClick={() => setEarlier(true)}>↑ {L.earlier}</button></p>}
            {board.length ? (
              <div className="ptable-wrap">
                <table className="tpstops">
                  <thead><tr><th>{L.time}</th><th>{L.train}</th><th></th>{hasPf && <th>{L.pf}</th>}<th className="num">{L.status}</th></tr></thead>
                  <tbody>
                    {rows.map((t, i) => {
                      const s = status(t, L);
                      const ends = t.destination === st.name;
                      const named = /^\d+$/.test(t.number || "");
                      return (
                        <tr key={i}>
                          <td className="num" style={{ textAlign: "left" }}>{t.time}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{named ? <Link href={trainPageHref(st.country, t.type, t.number)} prefetch={false}>{t.type} {t.number}</Link> : t.type}</td>
                          <td>{fill(ends ? L.from : L.to, { x: shortName(ends ? t.origin : t.destination) })}</td>
                          {hasPf && <td className="num">{t.pf || ""}</td>}
                          <td className="num"><span className={`pill ${s.cls}`}>{s.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">{L.noneToday}</p>}
            {!all && rest.length > SHOW && <p className="small"><button type="button" className="linkbtn" onClick={() => setAll(true)}>↓ {fill(L.more, { n: rest.length })}</button></p>}
            <p className="muted small">{fill(L.note, { t: st.now.hm })}</p>
          </section>
        </div>
        <div className="col">
          <section className="card">
            <h3>{L.map}</h3>
            <StationMap country={st.country} name={st.name} day={st.today} />
            <p className="muted small">{fill(L.mapNote, { s: name })}</p>
          </section>
          <section className="card">
            <h3>{L.week}</h3>
            {st.measured > 0 ? (
              <>
                <table className="tpweek">
                  <tbody>
                    <tr><td>{L.runs}</td><td className="num">{st.measured}</td></tr>
                    <tr><td>{L.onTime}</td><td className="num"><b>{p} %</b></td></tr>
                    <tr><td>{L.late15}</td><td className="num">{st.late15}</td></tr>
                    {st.cancelled > 0 && <tr><td>{L.cancelledW}</td><td className="num">{st.cancelled}</td></tr>}
                    {st.avg_delay != null && <tr><td>{L.avg}</td><td className="num">{Number(st.avg_delay).toLocaleString(loc)} min</td></tr>}
                  </tbody>
                </table>
                <p className="muted small">{st.first_day} – {st.last_day}</p>
              </>
            ) : <p className="muted">{L.noneToday}</p>}
            <p className="small">{L.weekPaid} <Link href="/">{L.weekPaidLink} →</Link></p>
          </section>
        </div>

      </div>
    </article>
  );
}
