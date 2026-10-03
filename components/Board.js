"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { fetchTrainsForDay, fetchCommentCounts } from "@/lib/queries";
import { TRAIN_TYPES, statusOf, toMin, fromMin, trainHref, ago, filterTrains, isShuttle, parisNowMin } from "@/lib/format";
import { stopMatches } from "@/lib/geo";
import { useLang } from "@/components/LangProvider";
import TrainMap from "@/components/TrainMap";

const STATUSES = [["all", "allStatus"], ["late", "delayed"], ["ontime", "ontime"]];

export default function Board({ initialTrains, initialCounts, today, loadError }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [trains, setTrains] = useState(initialTrains);
  const [counts, setCounts] = useState(initialCounts);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [station, setStation] = useState(null);
  const [running, setRunning] = useState([]);

  // Refresh data every minute without reloading the page
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    const refresh = async () => {
      const [{ data: tr, error }, c] = await Promise.all([fetchTrainsForDay(sb, today), fetchCommentCounts(sb, today)]);
      if (!error) setTrains(tr);
      setCounts(c);
    };
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [today]);

  const real = useMemo(() => trains.filter((x) => !isShuttle(x)), [trains]);
  const list = useMemo(() => filterTrains(trains, { type, status, q }, t), [trains, type, status, q, t]);

  const stats = useMemo(() => {
    const moving = real.filter((x) => !x.cancelled);
    const onTime = moving.filter((x) => (x.delay_min || 0) < 5).length;
    const avg = moving.length ? Math.round(moving.reduce((a, x) => a + (x.delay_min || 0), 0) / moving.length) : 0;
    const lastRt = real.reduce((a, x) => (x.rt_updated_at && x.rt_updated_at > a ? x.rt_updated_at : a), "");
    return { total: real.length, onTimePct: real.length ? Math.round((onTime / real.length) * 100) : 0, avg, lastRt };
  }, [real]);

  const runningIds = useMemo(() => new Set(running.map((r) => r.tr.id)), [running]);
  const sorted = useMemo(() => [...list].sort((a, b) => toMin(a.dep) - toMin(b.dep)), [list]);

  return (
    <>
      <section className="stats" aria-label={t("liveNow")}>
        <Stat k={t("stTotal")} v={stats.total || "–"} />
        <Stat k={t("stOntime")} v={stats.total ? stats.onTimePct : "–"} unit={stats.total ? "%" : ""} />
        <Stat k={t("stAvg")} v={stats.total ? stats.avg : "–"} unit={stats.total ? "min" : ""} />
        <Stat k={t("stRunning")} v={stats.total ? running.length : "–"} live />
      </section>

      {stats.lastRt && <p className="muted" style={{ margin: "8px 0 0" }}>{t("updatedSrc", ago(stats.lastRt, t, lang))}</p>}
      {loadError && <div className="notice"><b>{t("loadError")}</b> {loadError}</div>}

      <div className="filters">
        <div className="seg" role="group" aria-label={t("typeGroup")}>
          {TRAIN_TYPES.map((x) => (
            <button key={x} type="button" className="chipbtn" aria-pressed={type === x} onClick={() => setType(x)}>{x === "all" ? t("all") : x}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label={t("statusGroup")}>
          {STATUSES.map(([k, l]) => (
            <button key={k} type="button" className="chipbtn" aria-pressed={status === k} onClick={() => setStatus(k)}>{t(l)}</button>
          ))}
        </div>
        <input className="search" type="search" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
      </div>

      <section className="mapgrid">
        <TrainMap
          trains={list}
          selectedStation={station}
          onStationClick={setStation}
          onTrainClick={(tr) => router.push(trainHref(tr.id))}
          onRunning={setRunning}
        />
        <aside className="side" aria-live="polite">
          {station
            ? <StationPanel station={station} trains={list} onBack={() => setStation(null)} />
            : <LivePanel running={running} hasTrains={real.length > 0} />}
        </aside>
      </section>

      <section className="board" aria-label={t("hDep")}>
        <div className="bhead"><span>{t("hDep")}</span><span>{t("hTrain")}</span><span>{t("hRoute")}</span><span>{t("hStatus")}</span><span style={{ textAlign: "right" }}>{t("hReports")}</span></div>
        {!real.length ? (
          <div className="empty">{t("noTrainsToday")}</div>
        ) : !sorted.length ? (
          <div className="empty">{t("nomatch")}</div>
        ) : (
          sorted.map((tr) => <Row key={tr.id} tr={tr} n={counts[tr.id] || 0} live={runningIds.has(tr.id)} />)
        )}
      </section>
    </>
  );
}

function Stat({ k, v, unit, live }) {
  return (
    <div className={"stat" + (live ? " live" : "")}>
      <div className="k">{k}</div>
      <div className="v num">{v}{unit ? <small>{unit}</small> : null}</div>
    </div>
  );
}

function Row({ tr, n, live }) {
  const { t } = useLang();
  const st = statusOf(tr, t);
  const late = !tr.cancelled && (tr.delay_min || 0) >= 5;
  const via = (tr.stops || []).slice(1, -1).map((s) => s.name);
  return (
    <Link href={trainHref(tr.id)} className="row" aria-label={`${tr.type} ${tr.number}, ${tr.origin} – ${tr.destination}, ${st.label}`}>
      <div className="time num c-time">{late ? <>{fromMin(toMin(tr.dep) + tr.delay_min)}<s>{tr.dep}</s></> : tr.dep}</div>
      <div className="c-train"><div className="tnum num">{tr.number}</div><span className="ttype">{tr.type}</span></div>
      <div className="route">
        <b>{tr.origin} → {tr.destination}{live && <span className="livetag">● {t("live")}</span>}</b>
        {via.length > 0 && <span className="via">{t("via")} {via.join(", ")}</span>}
      </div>
      <div className="c-status"><span className={`pill ${st.cls}`}>{st.label}</span></div>
      <div className="ccount num">{n ? t("reports", n) : "—"}</div>
    </Link>
  );
}

function MiniRow({ tr, time, delay, sub, past }) {
  const { t } = useLang();
  const st = statusOf(tr, t);
  return (
    <li className={past ? "past" : ""}>
      <Link href={trainHref(tr.id)} className="minirow">
        <div className="t num">{delay >= 5 && !tr.cancelled ? <>{fromMin(toMin(time) + delay)}<s>{time}</s></> : time}</div>
        <div className="d"><b>{tr.type} {tr.number}</b><span>{sub}</span></div>
        <span className={`pill ${st.cls}`}>{st.label}</span>
      </Link>
    </li>
  );
}

function LivePanel({ running, hasTrains }) {
  const { t } = useLang();
  const late = running.filter((x) => (x.tr.delay_min || 0) >= 5).sort((a, b) => b.tr.delay_min - a.tr.delay_min).slice(0, 5);
  return (
    <>
      <div>
        <h4>{t("liveNow")}</h4>
        {running.length ? <h3>{t("running", running.length)}</h3> : <p className="muted">{hasTrains ? t("noneRunning") : t("loading")}</p>}
      </div>
      {running.length > 0 && (
        <div>
          <h4>{t("mostDelayed")}</h4>
          {!late.length ? <p className="muted">{t("allOnTime")}</p> : (
            <ul className="mini">
              {late.map(({ tr, p }) => <MiniRow key={tr.id} tr={tr} time={p.next.time} delay={p.next.delay || 0} sub={`${t("to")} ${tr.destination}`} />)}
            </ul>
          )}
        </div>
      )}
      <div>
        <h4>{t("legend")}</h4>
        <div className="legend">
          <LegendRow svg={<line x1="2" y1="7" x2="32" y2="7" stroke="var(--rail-lgv)" strokeWidth="3.2" strokeLinecap="round" />} text={t("lgv")} />
          <LegendRow svg={<line x1="2" y1="7" x2="32" y2="7" stroke="var(--rail-classic)" strokeWidth="1.8" strokeDasharray="5 4" />} text={t("classic")} />
          <LegendRow svg={<circle cx="17" cy="7" r="4.5" fill="var(--station)" stroke="var(--rail-lgv)" strokeWidth="2" />} text={t("station")} />
          {[["ok", "tOk"], ["warn", "tWarn"], ["bad", "tBad"]].map(([c, k]) => (
            <LegendRow key={c} svg={<path d="M24 7L11 1.5L14 7L11 12.5Z" fill={`var(--${c})`} stroke="var(--surface)" strokeWidth="1.2" strokeLinejoin="round" />} text={t(k)} />
          ))}
        </div>
      </div>
      <p className="muted">{t("sideHint")}</p>
    </>
  );
}

function LegendRow({ svg, text }) {
  return <div><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">{svg}</svg><span>{text}</span></div>;
}

function StationPanel({ station, trains, onBack }) {
  const { t } = useLang();
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(parisNowMin()); }, [station, trains]);
  const items = useMemo(() => {
    const out = [];
    for (const tr of trains) {
      const idx = (tr.stops || []).findIndex((s) => stopMatches(s, station));
      if (idx < 0) continue;
      const s = tr.stops[idx], last = idx === tr.stops.length - 1;
      const sub = last ? `${t("arr")} · ${t("from")} ${tr.origin}` : `${t("depS")} · ${t("to")} ${tr.destination}${station === "Paris" ? " · " + s.name.replace(/^Paris /, "") : ""}`;
      const m = toMin(s.time) + (s.delay || 0);
      out.push({ tr, s, sub, m, past: now != null && m < now - 2 });
    }
    return out.sort((a, b) => (a.past - b.past) || (a.past ? b.m - a.m : a.m - b.m)).slice(0, 80);
  }, [trains, station, now, t]);
  return (
    <>
      <button type="button" className="linkish" onClick={onBack}>{t("backLive")}</button>
      <div><h4>{t("atStation")}</h4><h3>{station}</h3></div>
      {!items.length ? <p className="muted">{t("noStop")}</p> : (
        <ul className="mini">
          {items.map((it) => <MiniRow key={it.tr.id} tr={it.tr} time={it.s.time} delay={it.s.delay || 0} sub={it.sub} past={it.past} />)}
        </ul>
      )}
    </>
  );
}
