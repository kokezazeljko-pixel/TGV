"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { LOCALES } from "@/lib/i18n";

// Punctuality of the last 7 full days, from the archive (database function punctuality_compare):
// Europe -> one line per country; one country -> one line per train type.
// The share of trains with live data is shown next to every figure, so a small sample is visible at once.

const TX = {
  en: { title: "Punctuality, last 7 days", byCountry: "By country", byType: "By train type", country: "Country", type: "Train", onTime: "On time", late15: "15+ min late", avg: "Avg. delay", cancelled: "Cancelled", live: "With live data", trains: "trains",
    note: "On time = at most 5 minutes late at the last stop. Only the trains on this site (high-speed and long-distance), only those with live data.",
    be: "Belgium: SNCB publishes only trains that deviate from the timetable; a train it does not mention is counted as on time.", fewLive: "Few trains with live data: the figure may not be representative.", none: "No archive data yet." },
  de: { title: "Pünktlichkeit, letzte 7 Tage", byCountry: "Nach Land", byType: "Nach Zuggattung", country: "Land", type: "Zug", onTime: "Pünktlich", late15: "15+ Min. verspätet", avg: "Ø Verspätung", cancelled: "Ausfälle", live: "Mit Echtzeitdaten", trains: "Züge",
    note: "Pünktlich = höchstens 5 Minuten Verspätung am letzten Halt. Nur die Züge dieser Seite (Hochgeschwindigkeit und Fernverkehr), nur mit Echtzeitdaten.",
    be: "Belgien: Die SNCB veröffentlicht nur Züge, die vom Fahrplan abweichen; ein nicht genannter Zug zählt als pünktlich.", fewLive: "Wenige Züge mit Echtzeitdaten: Der Wert ist eventuell nicht repräsentativ.", none: "Noch keine Archivdaten." },
  fr: { title: "Ponctualité, 7 derniers jours", byCountry: "Par pays", byType: "Par type de train", country: "Pays", type: "Train", onTime: "À l'heure", late15: "15+ min de retard", avg: "Retard moyen", cancelled: "Supprimés", live: "Avec données en direct", trains: "trains",
    note: "À l'heure = au plus 5 minutes de retard au dernier arrêt. Uniquement les trains de ce site (grande vitesse et grandes lignes), avec données en direct.",
    be: "Belgique : la SNCB ne publie que les trains qui s'écartent de l'horaire ; un train non mentionné compte comme à l'heure.", fewLive: "Peu de trains avec données en direct : le chiffre peut ne pas être représentatif.", none: "Pas encore de données archivées." },
  nl: { title: "Stiptheid, laatste 7 dagen", byCountry: "Per land", byType: "Per treinsoort", country: "Land", type: "Trein", onTime: "Op tijd", late15: "15+ min vertraagd", avg: "Gem. vertraging", cancelled: "Uitgevallen", live: "Met live gegevens", trains: "treinen",
    note: "Op tijd = hoogstens 5 minuten vertraging bij de laatste halte. Alleen de treinen op deze site (hogesnelheid en lange afstand), met live gegevens.",
    be: "België: de NMBS publiceert alleen treinen die van de dienstregeling afwijken; een trein die niet genoemd wordt, telt als op tijd.", fewLive: "Weinig treinen met live gegevens: het cijfer is mogelijk niet representatief.", none: "Nog geen archiefgegevens." },
  es: { title: "Puntualidad, últimos 7 días", byCountry: "Por país", byType: "Por tipo de tren", country: "País", type: "Tren", onTime: "Puntual", late15: "15+ min de retraso", avg: "Retraso medio", cancelled: "Cancelados", live: "Con datos en directo", trains: "trenes",
    note: "Puntual = como mucho 5 minutos de retraso en la última parada. Solo los trenes de esta web (alta velocidad y larga distancia), con datos en directo.",
    be: "Bélgica: la SNCB solo publica los trenes que se desvían del horario; un tren no mencionado cuenta como puntual.", fewLive: "Pocos trenes con datos en directo: la cifra puede no ser representativa.", none: "Aún no hay datos archivados." },
};
const FEW = 0.6; // under 60 % of trains with live data: marked

function sum(rows) {
  const s = { planned: 0, live: 0, measured: 0, on_time: 0, late15: 0, cancelled: 0, delaySum: 0 };
  for (const r of rows) {
    s.planned += r.planned; s.live += r.live; s.measured += r.measured; s.on_time += r.on_time; s.late15 += r.late15; s.cancelled += r.cancelled;
    if (r.avg_delay != null) s.delaySum += Number(r.avg_delay) * r.measured;
  }
  return s;
}

export default function PunctualityTable({ country, t, lang }) {
  const L = TX[lang] || TX.en;
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    sb.rpc("punctuality_week").then(({ data }) => setRows(data || []));
  }, []);
  if (!rows) return null;
  const loc = LOCALES[lang] || "en-GB";
  const pct = (a, b) => (b ? (Math.round((1000 * a) / b) / 10).toLocaleString(loc) + " %" : "–");
  if (!rows.length) return <section className="card ptable"><h3>{L.title}</h3><p className="muted">{L.none}</p></section>;

  const groups = new Map();
  for (const r of rows) {
    if (country !== "all" && r.country !== country) continue;
    const k = country === "all" ? r.country : r.type;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const lines = [...groups].map(([k, rs]) => {
    const s = sum(rs);
    return { k, s, onPct: s.measured ? s.on_time / s.measured : -1, livePct: s.planned ? s.live / s.planned : 0 };
  }).filter((x) => x.s.measured > 0 && x.s.planned >= 20).sort((a, b) => b.onPct - a.onPct);
  if (!lines.length) return null;
  const range = `${rows[0].first_day} – ${rows[0].last_day}`;
  const showBe = country === "be" || (country === "all" && lines.some((x) => x.k === "be"));

  return (
    <section className="card ptable" aria-labelledby="ptable-title">
      <h3 id="ptable-title">{L.title} · {country === "all" ? L.byCountry : L.byType}</h3>
      <p className="muted small">{range}</p>
      <div className="ptable-wrap">
        <table>
          <thead>
            <tr><th>{country === "all" ? L.country : L.type}</th><th className="num">{L.onTime}</th><th className="num">{L.late15}</th><th className="num">{L.avg}</th><th className="num">{L.cancelled}</th><th className="num">{L.live}</th></tr>
          </thead>
          <tbody>
            {lines.map(({ k, s, livePct }) => {
              return (
                <tr key={k}>
                  <td>{country === "all" ? <><span className={`flag flag-${k}`} aria-hidden="true" /> {t("country_" + k)}</> : k}</td>
                  <td className="num"><b>{pct(s.on_time, s.measured)}</b></td>
                  <td className="num">{pct(s.late15, s.measured)}</td>
                  <td className="num">{s.measured ? (Math.round((10 * s.delaySum) / s.measured) / 10).toLocaleString(loc) + " min" : "–"}</td>
                  <td className="num">{s.cancelled.toLocaleString(loc)}</td>
                  <td className="num" title={`${s.live} / ${s.planned} ${L.trains}`}>{pct(s.live, s.planned)}{livePct < FEW ? " *" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">{L.note}</p>
      {lines.some((x) => x.livePct < FEW) && <p className="muted small">* {L.fewLive}</p>}
      {showBe && <p className="muted small">{L.be}</p>}
    </section>
  );
}
