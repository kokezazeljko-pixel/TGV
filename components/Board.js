"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { fetchTrainsForDay, fetchCommentCounts } from "@/lib/queries";
import { TRAIN_TYPES, statusOf, toMin, fromMin, plural, trainHref, ago } from "@/lib/format";

const STATUSES = [["all", "Svi statusi"], ["late", "Kasne"], ["ontime", "Na vreme"]];

export default function Board({ initialTrains, initialCounts, today, loadError }) {
  const [trains, setTrains] = useState(initialTrains);
  const [counts, setCounts] = useState(initialCounts);
  const [type, setType] = useState("Svi");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  // Osvežavanje podataka svakog minuta, bez ponovnog učitavanja stranice
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    const refresh = async () => {
      const [{ data: t, error }, c] = await Promise.all([fetchTrainsForDay(sb, today), fetchCommentCounts(sb, today)]);
      if (!error) setTrains(t);
      setCounts(c);
    };
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [today]);

  const stats = useMemo(() => {
    const running = trains.filter((t) => !t.cancelled);
    const onTime = running.filter((t) => (t.delay_min || 0) < 5).length;
    const avg = running.length ? Math.round(running.reduce((a, t) => a + (t.delay_min || 0), 0) / running.length) : 0;
    const comments = Object.values(counts).reduce((a, b) => a + b, 0);
    const lastRt = trains.reduce((a, t) => (t.rt_updated_at && t.rt_updated_at > a ? t.rt_updated_at : a), "");
    return { total: trains.length, onTimePct: trains.length ? Math.round((onTime / trains.length) * 100) : 0, avg, comments, lastRt };
  }, [trains, counts]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trains
      .filter((t) => type === "Svi" || t.type === type)
      .filter((t) => status === "all" || statusOf(t).key === status)
      .filter((t) => !query || [t.number, t.origin, t.destination, ...(t.stops || []).map((s) => s.name)].join(" ").toLowerCase().includes(query))
      .sort((a, b) => toMin(a.dep) - toMin(b.dep));
  }, [trains, type, status, q]);

  return (
    <>
      <section className="stats" aria-label="Pregled">
        <Stat k="Vozova danas" v={stats.total || "–"} />
        <Stat k="Na vreme" v={stats.total ? stats.onTimePct : "–"} unit={stats.total ? "%" : ""} />
        <Stat k="Prosečno kašnjenje" v={stats.total ? stats.avg : "–"} unit={stats.total ? "min" : ""} />
        <Stat k="Komentari putnika" v={stats.comments} />
      </section>

      {stats.lastRt && <p className="muted" style={{ margin: "8px 0 0" }}>Kašnjenja ažurirana {ago(stats.lastRt)} · izvor: SNCF otvoreni podaci</p>}
      {loadError && <div className="notice"><b>Greška pri učitavanju:</b> {loadError}</div>}

      <div className="filters">
        <div className="seg" role="group" aria-label="Vrsta voza">
          {TRAIN_TYPES.map((t) => (
            <button key={t} type="button" className="chipbtn" aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Status">
          {STATUSES.map(([k, l]) => (
            <button key={k} type="button" className="chipbtn" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <input className="search" type="search" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Broj voza ili grad, npr. 6611 ili Lyon" aria-label="Pretraga" />
      </div>

      <section className="board" aria-label="Polasci">
        <div className="bhead"><span>Polazak</span><span>Voz</span><span>Relacija</span><span>Status</span><span style={{ textAlign: "right" }}>Utisci</span></div>
        {!trains.length ? (
          <div className="empty">Još nema vozova za danas. Pokreni skriptu za red vožnje (README.md, korak 5).</div>
        ) : !list.length ? (
          <div className="empty">Nijedan voz ne odgovara filteru.</div>
        ) : (
          list.map((t) => <Row key={t.id} t={t} n={counts[t.id] || 0} />)
        )}
      </section>
    </>
  );
}

function Stat({ k, v, unit }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v num">{v}{unit ? <small>{unit}</small> : null}</div>
    </div>
  );
}

function Row({ t, n }) {
  const st = statusOf(t);
  const late = !t.cancelled && (t.delay_min || 0) >= 5;
  const via = (t.stops || []).slice(1, -1).map((s) => s.name);
  return (
    <Link href={trainHref(t.id)} className="row" aria-label={`${t.type} ${t.number}, ${t.origin} – ${t.destination}, ${st.label}`}>
      <div className="time num c-time">
        {late ? <>{fromMin(toMin(t.dep) + t.delay_min)}<s>{t.dep}</s></> : t.dep}
      </div>
      <div className="c-train"><div className="tnum num">{t.number}</div><span className="ttype">{t.type}</span></div>
      <div className="route">
        <b>{t.origin} → {t.destination}</b>
        {via.length > 0 && <span className="via">preko {via.join(", ")}</span>}
      </div>
      <div className="c-status"><span className={`pill ${st.cls}`}>{st.label}</span></div>
      <div className="ccount num">{n ? `${n} ${plural(n, "utisak", "utiska", "utisaka")}` : "—"}</div>
    </Link>
  );
}
