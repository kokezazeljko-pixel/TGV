"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { fetchTrainsForDay, fetchTrainsUpdatedSince, fetchCommentCounts } from "@/lib/queries";
import { statusOf, toMin, fromMin, trainHref, ago, filterTrains, isShuttle, parisNowMin } from "@/lib/format";
import { getGeo } from "@/lib/geo";

// Map views: both countries together first, then Switzerland, then France
const COUNTRIES = ["all", "ch", "fr"];
const DEFAULT_COUNTRY = "all"; // the server sends this view's trains with the page
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
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
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(false);
  const usedInitial = useRef(false); // the trains sent with the page are used only once, for the default view

  // Remember the chosen country in this browser
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem("tp-country"); } catch {}
    if (saved && saved !== DEFAULT_COUNTRY && COUNTRIES.includes(saved)) setCountry(saved);
  }, []);
  const chooseCountry = (c) => {
    if (c === country) return;
    try { localStorage.setItem("tp-country", c); } catch {}
    setStation(null); setType("all"); setRunning([]); setCountry(c);
  };

  // Load the chosen country's trains, then every minute fetch only the trains whose delays changed
  // (a full reload every 30 minutes picks up anything else). Keeps the data transfer small.
  const latest = useRef("");
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    let alive = true, ticks = 0;
    const ms = (iso) => (iso ? Date.parse(iso) : 0);
    const newest = (rows, from = "") => rows.reduce((a, x) => (ms(x.rt_updated_at) > ms(a) ? new Date(ms(x.rt_updated_at)).toISOString() : a), from);
    const full = async (showLoading) => {
      if (showLoading) setLoading(true);
      const [{ data: tr, error }, c] = await Promise.all([fetchTrainsForDay(sb, today, country), fetchCommentCounts(sb, today)]);
      if (!alive) return;
      if (!error) { setTrains(tr); latest.current = newest(tr); }
      setCounts(c);
      setLoading(false);
    };
    const changes = async () => {
      if (!latest.current) return full(false);
      const [{ data: upd, error }, c] = await Promise.all([fetchTrainsUpdatedSince(sb, today, country, latest.current), fetchCommentCounts(sb, today)]);
      if (!alive) return;
      setCounts(c);
      if (error || !upd.length) return;
      latest.current = newest(upd, latest.current);
      const byId = new Map(upd.map((x) => [x.id, x]));
      setTrains((old) => old.map((x) => byId.get(x.id) || x));
    };
    if (country === DEFAULT_COUNTRY && !usedInitial.current) { usedInitial.current = true; latest.current = newest(initialTrains); }
    else { usedInitial.current = true; setTrains([]); full(true); }
    const id = setInterval(() => { ticks++; ticks % 30 === 0 ? full(false) : changes(); }, 60000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, country]);

  const real = useMemo(() => trains.filter((x) => !isShuttle(x)), [trains]);
  const list = useMemo(() => filterTrains(trains, { type, status, q }, t), [trains, type, status, q, t]);

  // Punctuality and average delay are measured on the trains running right now (the ones on the map).
  // Counting the whole day would mix in trains that have not left yet, which always show 0 min.
  const stats = useMemo(() => {
    const now = running.map((r) => r.tr).filter((x) => !x.cancelled);
    const onTime = now.filter((x) => (x.delay_min || 0) < 5).length;
    const sum = now.reduce((a, x) => a + (x.delay_min || 0), 0);
    const avg = now.length ? sum / now.length : 0;
    const lastRt = real.reduce((a, x) => (x.rt_updated_at && x.rt_updated_at > a ? x.rt_updated_at : a), "");
    return {
      total: real.length,
      running: now.length,
      onTimePct: now.length ? Math.round((onTime / now.length) * 100) : 0,
      avg: avg < 10 ? Math.round(avg * 10) / 10 : Math.round(avg),
      lastRt,
    };
  }, [real, running]);

  // Train types offered as filters: the ones present in this country's data, most common first
  const types = useMemo(() => {
    const n = {};
    for (const x of real) n[x.type] = (n[x.type] || 0) + 1;
    return ["all", ...Object.keys(n).sort((a, b) => n[b] - n[a])];
  }, [real]);

  // Every station served today, for the station menu (grouped by country on the combined map)
  const stationGroups = useMemo(() => {
    const seen = new Map(); // name -> { fr: n, ch: n }
    for (const tr of real) for (const s of tr.stops || []) {
      if (!s.name) continue;
      const c = seen.get(s.name) || {};
      c[tr.country] = (c[tr.country] || 0) + 1;
      seen.set(s.name, c);
    }
    const groups = { ch: [], fr: [] };
    for (const [name, c] of seen) groups[(c.ch || 0) > (c.fr || 0) ? "ch" : "fr"].push(name);
    const loc = LOCALES[lang] || "en-GB";
    for (const g of Object.values(groups)) g.sort((a, b) => a.localeCompare(b, loc));
    return groups;
  }, [real, lang]);
  const stationNames = useMemo(() => new Set([...stationGroups.ch, ...stationGroups.fr]), [stationGroups]);
  const pickStation = (name) => {
    setStation(name || null);
    if (name) requestAnimationFrame(() => document.querySelector(".mapbox")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  // With a station selected, the map and the board show only the trains that stop there
  const shown = useMemo(() => {
    if (!station) return list;
    const { stopMatches } = getGeo(country);
    return list.filter((tr) => (tr.stops || []).some((s) => stopMatches(s, station)));
  }, [list, station, country]);

  const runningIds = useMemo(() => new Set(running.map((r) => r.tr.id)), [running]);
  const sorted = useMemo(() => [...shown].sort((a, b) => toMin(a.dep) - toMin(b.dep)), [shown]);

  return (
    <>
      <div className="countries" role="group" aria-label={t("countryGroup")}>
        {COUNTRIES.map((c) => (
          <button key={c} type="button" className="countrybtn" aria-pressed={country === c} onClick={() => chooseCountry(c)}>
            {(c === "all" ? ["ch", "fr"] : [c]).map((f) => <span key={f} className={`flag flag-${f}`} aria-hidden="true" />)}{t("country_" + c)}
          </button>
        ))}
      </div>

      <section className="stats" aria-label={t("liveNow")}>
        <Stat k={t("stTotal")} v={stats.total || "–"} />
        <Stat k={t("stOntime")} v={stats.running ? stats.onTimePct : "–"} unit={stats.running ? "%" : ""} />
        <Stat k={t("stAvg")} v={stats.running ? stats.avg.toLocaleString(LOCALES[lang]) : "–"} unit={stats.running ? "min" : ""} />
        <Stat k={t("stRunning")} v={stats.total ? running.length : "–"} live />
      </section>

      {stats.lastRt && <p className="muted" style={{ margin: "8px 0 0" }}>{t("updatedSrc", ago(stats.lastRt, t, lang), t("source_" + country))}</p>}
      {loadError && <div className="notice"><b>{t("loadError")}</b> {loadError}</div>}

      <div className="filters">
        <div className="seg" role="group" aria-label={t("typeGroup")}>
          {types.map((x) => (
            <button key={x} type="button" className="chipbtn" aria-pressed={type === x} onClick={() => setType(x)}>{x === "all" ? t("all") : x}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label={t("statusGroup")}>
          {STATUSES.map(([k, l]) => (
            <button key={k} type="button" className="chipbtn" aria-pressed={status === k} onClick={() => setStatus(k)}>{t(l)}</button>
          ))}
        </div>
        <label className="stationpick">
          <span className="sr">{t("stationPick")}</span>
          <select value={station && stationNames.has(station) ? station : ""} onChange={(e) => pickStation(e.target.value)} aria-label={t("stationPick")}>
            <option value="">{t("stationChoose")}</option>
            {(country === "all" ? ["ch", "fr"] : [country]).map((c) =>
              stationGroups[c].length ? (
                country === "all"
                  ? <optgroup key={c} label={t("country_" + c)}>{stationGroups[c].map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                  : stationGroups[c].map((n) => <option key={n} value={n}>{n}</option>)
              ) : null,
            )}
          </select>
        </label>
        <input className="search" type="search" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
      </div>

      <section className="mapgrid">
        <TrainMap
          key={country}
          country={country}
          trains={shown}
          selectedStation={station}
          onStationClick={setStation}
          onTrainClick={(tr) => router.push(trainHref(tr.id))}
          onRunning={setRunning}
        />
        <aside className="side" aria-live="polite">
          {station
            ? <StationPanel station={station} trains={list} country={country} onBack={() => setStation(null)} />
            : <LivePanel running={running} hasTrains={real.length > 0} country={country} />}
        </aside>
      </section>

      <section className="board" aria-label={t("hDep")}>
        <div className="bhead"><span>{t("hDep")}</span><span>{t("hTrain")}</span><span>{t("hRoute")}</span><span>{t("hStatus")}</span><span style={{ textAlign: "right" }}>{t("hReports")}</span></div>
        {!real.length ? (
          <div className="empty">{loading ? t("loading") : t("noTrainsToday")}</div>
        ) : !sorted.length ? (
          <div className="empty">{t("nomatch")}</div>
        ) : (
          sorted.map((tr) => <Row key={tr.id} tr={tr} n={counts[tr.id] || 0} live={runningIds.has(tr.id)} flag={country === "all"} />)
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

function Row({ tr, n, live, flag }) {
  const { t } = useLang();
  const st = statusOf(tr, t);
  const late = !tr.cancelled && (tr.delay_min || 0) >= 5;
  const via = (tr.stops || []).slice(1, -1).map((s) => s.name);
  return (
    <Link href={trainHref(tr.id)} className="row" aria-label={`${tr.type} ${tr.number}, ${tr.origin} – ${tr.destination}, ${st.label}`}>
      <div className="time num c-time">{late ? <>{fromMin(toMin(tr.dep) + tr.delay_min)}<s>{tr.dep}</s></> : tr.dep}</div>
      <div className="c-train"><div className="tnum num">{flag && <span className={`flag mini flag-${tr.country}`} aria-hidden="true" />}{tr.number}</div><span className="ttype">{tr.type}</span></div>
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

function LivePanel({ running, hasTrains, country }) {
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
          <LegendRow svg={<line x1="2" y1="7" x2="32" y2="7" stroke="var(--rail-lgv)" strokeWidth="3.2" strokeLinecap="round" />} text={t(country === "fr" ? "lgv" : "lgv_" + country)} />
          <LegendRow svg={<line x1="2" y1="7" x2="32" y2="7" stroke="var(--rail-classic)" strokeWidth="1.8" strokeDasharray="5 4" />} text={t(country === "fr" ? "classic" : "classic_" + country)} />
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

function StationPanel({ station, trains, country, onBack }) {
  const { stopMatches } = getGeo(country);
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
