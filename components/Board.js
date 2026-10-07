"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useSession } from "@/components/useSession";
import { useProfile } from "@/components/Avatar";
import { KOFI_URL } from "@/lib/site";
import { fetchTrainsForDay, fetchTrainsUpdatedSince, fetchCommentCounts, fetchAlertTrainIds } from "@/lib/queries";
import { statusOf, toMin, fromMin, trainHref, ago, filterTrains, isShuttle, parisNowMin, plannedPf, isScheduleOnly, SCHEDULE_ONLY } from "@/lib/format";
import { getGeo } from "@/lib/geo";

// Map views: all countries together first, then Switzerland, France, Belgium and the Netherlands
const COUNTRIES = ["all", "ch", "fr", "de", "es", "pt", "be", "nl", "lu"];
const REAL = COUNTRIES.slice(1);
const DEFAULT_COUNTRY = "all"; // the server sends this view's trains with the page
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
import TrainMap, { PinShape } from "@/components/TrainMap";

// "Paris-Est" = "Paris Est", "Paris Gare de Lyon Hall 1 - 2" = "Paris Gare de Lyon", but "Lyon Perrache" ≠ "Lyon Part-Dieu"
const normName = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bhall\b|\d+/g, " ").replace(/[^a-z]+/g, " ").trim();
const sameStation = (a, b) => { const x = normName(a), y = normName(b); return x === y || x.startsWith(y + " ") || y.startsWith(x + " "); };

const STATUSES = [["all", "allStatus"], ["late", "delayed"], ["ontime", "ontime"]];

// Earlier days (paid): the 7 days before today
const HISTORY_DAYS = 7;
const shiftDay = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export default function Board({ initialTrains, initialCounts, today, loadError }) {
  const { t, lang } = useLang();
  const { session } = useSession();
  const { profile } = useProfile(session);
  const [day, setDay] = useState(today); // which day the board shows
  const isPast = day < today;
  const [access, setAccess] = useState(null); // until when this account may see earlier days
  const checkAccess = async () => {
    const sb = getBrowserClient();
    if (!sb || !session) { setAccess(null); return null; }
    const { data } = await sb.from("history_access").select("until").maybeSingle();
    const until = data?.until && Date.parse(data.until) > Date.now() ? data.until : null;
    setAccess(until);
    return until;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkAccess(); }, [session]);
  const locked = isPast && !access;
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
  const [listCountry, setListCountry] = useState("all"); // whose trains the list under the map shows (Europe view)
  const [alertIds, setAlertIds] = useState(() => new Set()); // trains with an official notice from the railway
  const usedInitial = useRef(false); // the trains sent with the page are used only once, for the default view

  // Remember the chosen country in this browser
  // A link like /?c=ch&station=Lausanne (from "My account") opens that country and station
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const qc = qs.get("c"), qst = qs.get("station");
    if (qst) setStation(qst.slice(0, 80));
    if (qc && COUNTRIES.includes(qc)) { if (qc !== DEFAULT_COUNTRY) setCountry(qc); return; }
    let saved = null;
    try { saved = localStorage.getItem("tp-country"); } catch {}
    if (saved && saved !== DEFAULT_COUNTRY && COUNTRIES.includes(saved)) setCountry(saved);
  }, []);
  // Signed in with a home country and nothing chosen yet in this browser: open on the home country
  const usedHome = useRef(false);
  useEffect(() => {
    if (!profile || usedHome.current) return;
    usedHome.current = true;
    let saved = null;
    try { saved = localStorage.getItem("tp-country"); } catch {}
    const qs = new URLSearchParams(window.location.search);
    if (!saved && !qs.get("c") && !qs.get("station") && COUNTRIES.includes(profile.home_country)) setCountry(profile.home_country);
  }, [profile]);
  const chooseCountry = (c) => {
    if (c === country) return;
    try { localStorage.setItem("tp-country", c); } catch {}
    setStation(null); setType("all"); setRunning([]); setListCountry("all"); setCountry(c);
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
      const [{ data: tr, error }, c, al] = await Promise.all([fetchTrainsForDay(sb, day, country), fetchCommentCounts(sb, day), fetchAlertTrainIds(sb)]);
      setAlertIds(al);
      if (!alive) return;
      if (!error) { setTrains(tr); latest.current = newest(tr); }
      setCounts(c);
      setLoading(false);
    };
    const changes = async () => {
      if (!latest.current) return full(false);
      const [{ data: upd, error }, c, al] = await Promise.all([fetchTrainsUpdatedSince(sb, day, country, latest.current), fetchCommentCounts(sb, day), fetchAlertTrainIds(sb)]);
      setAlertIds(al);
      if (!alive) return;
      setCounts(c);
      if (error || !upd.length) return;
      latest.current = newest(upd, latest.current);
      const byId = new Map(upd.map((x) => [x.id, x]));
      setTrains((old) => old.map((x) => byId.get(x.id) || x));
    };
    if (country === DEFAULT_COUNTRY && day === today && !usedInitial.current) { usedInitial.current = true; latest.current = newest(initialTrains); fetchAlertTrainIds(sb).then((al) => alive && setAlertIds(al)); }
    else { usedInitial.current = true; setTrains([]); full(true); }
    const id = setInterval(() => { ticks++; ticks % 30 === 0 ? full(false) : changes(); }, 60000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, country, access]);

  const real = useMemo(() => trains.filter((x) => !isShuttle(x)), [trains]);
  const list = useMemo(() => filterTrains(trains, { type, status, q }, t), [trains, type, status, q, t]);

  // Punctuality and average delay are measured on the trains running right now (the ones on the map).
  // Counting the whole day would mix in trains that have not left yet, which always show 0 min.
  const stats = useMemo(() => {
    const now = running.map((r) => r.tr).filter((x) => !x.cancelled && !isScheduleOnly(x)); // timetable-only trains say nothing about punctuality
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

  // Every station served today, for the station menu (grouped by country on the combined map).
  // Stops that belong to a map station use its name, so spellings like "Paris-Est" / "Paris Est" become one entry.
  const stationGroups = useMemo(() => {
    const { stopNode } = getGeo(country);
    const seen = new Map(); // name -> { fr: n, ch: n, be: n }
    for (const tr of real) for (const s of tr.stops || []) {
      if (!s.name) continue;
      const n = stopNode(s);
      const name = n?.name && sameStation(n.name, s.name) ? n.name : s.name;
      const c = seen.get(name) || {};
      c[tr.country] = (c[tr.country] || 0) + 1;
      seen.set(name, c);
    }
    const groups = Object.fromEntries(REAL.map((k) => [k, []]));
    for (const [name, c] of seen) groups[REAL.reduce((a, k) => ((c[k] || 0) > (c[a] || 0) ? k : a), "fr")].push(name);
    const loc = LOCALES[lang] || "en-GB";
    for (const g of Object.values(groups)) g.sort((a, b) => a.localeCompare(b, loc));
    return groups;
  }, [real, lang, country]);
  const stationNames = useMemo(() => new Set(Object.values(stationGroups).flat()), [stationGroups]);
  const pickStation = (name) => {
    setStation(name || null);
    if (name) requestAnimationFrame(() => document.querySelector(".mapbox")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  // the ★ button: the favourite station from "My account" (switching to its country if another one is open)
  const home = profile?.home_station || null;
  const goHome = () => {
    if (station === home) return setStation(null);
    const c = profile.home_country;
    if (c && country !== "all" && c !== country) chooseCountry(c);
    pickStation(home);
  };

  // With a station selected, the map and the board show only the trains that stop there
  const shown = useMemo(() => {
    if (!station) return list;
    const { stopMatches } = getGeo(country);
    return list.filter((tr) => (tr.stops || []).some((s) => stopMatches(s, station)));
  }, [list, station, country]);

  const runningIds = useMemo(() => new Set(running.map((r) => r.tr.id)), [running]);
  const sorted = useMemo(() => [...shown].filter((x) => listCountry === "all" || x.country === listCountry).sort((a, b) => toMin(a.dep) - toMin(b.dep)), [shown, listCountry]);
  // Under the map: the trains running right now first, then every train of the day from the morning
  const liveRows = useMemo(() => sorted.filter((x) => runningIds.has(x.id)), [sorted, runningIds]);
  const dayRows = useMemo(() => sorted.filter((x) => !runningIds.has(x.id)), [sorted, runningIds]);
  const rowFlag = country === "all" && listCountry === "all";

  return (
    <>
      <div className="countries" role="group" aria-label={t("countryGroup")}>
        {COUNTRIES.map((c) => (
          <button key={c} type="button" className="countrybtn" aria-pressed={country === c} onClick={() => chooseCountry(c)}>
            {(c === "all" ? ["eu"] : [c]).map((f) => <span key={f} className={`flag flag-${f}`} aria-hidden="true" />)}{t("country_" + c)}
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
      {SCHEDULE_ONLY.has(country) ? <SchedNotice country={country} /> : <AskBubble />}

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
        {home && (
          <button type="button" className="chipbtn starbtn" aria-pressed={station === home} onClick={goHome} title={t("myStation")}>★ {home}</button>
        )}
        <label className="stationpick">
          <span className="sr">{t("stationPick")}</span>
          <select value={station && stationNames.has(station) ? station : ""} onChange={(e) => pickStation(e.target.value)} aria-label={t("stationPick")}>
            <option value="">{t("stationChoose")}</option>
            {(country === "all" ? REAL : [country]).map((c) =>
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

      <div className="boardbar">
        <h3>{t("listTitle")}</h3>
        <label className="daypick">
          <span className="sr">{t("dayPick")}</span>
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label={t("dayPick")}>
            {Array.from({ length: HISTORY_DAYS + 1 }, (_, i) => shiftDay(today, -i)).map((d, i) => (
              <option key={d} value={d}>
                {i === 0 ? t("dayToday") : i === 1 ? t("dayYesterday") : new Date(d + "T12:00:00Z").toLocaleDateString(LOCALES[lang] || "en-GB", { weekday: "long", day: "numeric", month: "long" })}
                {i > 0 && !access ? " 🔒" : ""}
              </option>
            ))}
          </select>
        </label>
        <CountryPicker value={country === "all" ? listCountry : country} locked={country !== "all"} onChange={setListCountry} />
      </div>
      <section className="board" aria-label={t("hDep")} style={{ marginTop: 10 }}>
        {!locked && <div className="bhead"><span>{t("hDep")}</span><span>{t("hTrain")}</span><span>{t("hRoute")}</span><span>{t("hStatus")}</span><span style={{ textAlign: "right" }}>{t("hReports")}</span></div>}
        {locked ? (
          <HistoryPaywall signedIn={!!session} onCheck={checkAccess} />
        ) : !real.length ? (
          <div className="empty">{loading ? t("loading") : isPast ? t("noTrainsDay") : t("noTrainsToday")}</div>
        ) : !sorted.length ? (
          <div className="empty">{t("nomatch")}</div>
        ) : (
          <>
            {liveRows.length > 0 && <div className="bsec live">● {t("secRunning")} <span className="n">({liveRows.length})</span></div>}
            {liveRows.map((tr) => <Row key={tr.id} tr={tr} n={counts[tr.id] || 0} live flag={rowFlag} notice={alertIds.has(tr.id)} />)}
            {isPast && access && <div className="bsec unlocked">🔓 {t("histActive", new Date(access).toLocaleString(LOCALES[lang] || "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }))}</div>}
            {dayRows.length > 0 && <div className="bsec">{isPast ? t("secDate") : t("secDay")} <span className="n">({dayRows.length})</span></div>}
            {dayRows.map((tr) => <Row key={tr.id} tr={tr} n={counts[tr.id] || 0} flag={rowFlag} notice={alertIds.has(tr.id)} />)}
          </>
        )}
      </section>
    </>
  );
}

// Earlier days are a paid extra: €1 or more on Ko-fi (same email as the account) = 24 hours of access
function HistoryPaywall({ signedIn, onCheck }) {
  const { t } = useLang();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true); setMsg("");
    const until = await onCheck();
    setBusy(false);
    if (!until) setMsg(t("histNotYet"));
  }
  return (
    <div className="paywall">
      <div className="pw-icon" aria-hidden="true">🔒</div>
      <h3>{t("histTitle")}</h3>
      <p>{t("histText")}</p>
      <ol>
        <li className={signedIn ? "done" : ""}>{signedIn ? "✓ " : ""}{t("histStep1")}{!signedIn && <> <Link href="/prijava">{t("signIn")} →</Link></>}</li>
        <li>{t("histStep2")}</li>
        <li>{t("histStep3")}</li>
      </ol>
      <div className="pw-actions">
        <a className="primary kofi" href={KOFI_URL} target="_blank" rel="noopener noreferrer">☕ {t("histPay")}</a>
        <a className="primary kofi monthly" href={`${KOFI_URL}/tiers`} target="_blank" rel="noopener noreferrer">💎 {t("histMonthly")}</a>
        {signedIn && <button type="button" className="ghost" onClick={check} disabled={busy}>{busy ? t("loading") : t("histCheck")}</button>}
      </div>
      {msg && <p className="note err">{msg}</p>}
    </div>
  );
}

// Luxembourg and Portugal (no live data yet): say so, and ask passengers on board to tell the others how it is going
function SchedNotice({ country }) {
  const { t } = useLang();
  return (
    <div className="infobox sched" role="note">
      <span className="ib-ico" aria-hidden="true">🕒</span>
      <div><b>{t("schedTitle", t("country_" + country))}</b><p>{t("schedText", t("country_" + country))}</p><p className="ib-ask">💬 {t("schedAsk", t("country_" + country))}</p></div>
    </div>
  );
}

// Speech bubble inviting passengers on a train to post an update (can be closed; remembered in this browser)
function AskBubble() {
  const { t } = useLang();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem("tp-ask-hidden") === "1"); } catch { setHidden(false); } }, []);
  if (hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem("tp-ask-hidden", "1"); } catch {} };
  return (
    <div className="askbubble" role="note">
      <span className="ib-ico" aria-hidden="true">💬</span>
      <div><b>{t("askTitle")}</b><p>{t("askText")}</p></div>
      <button type="button" className="ib-close" onClick={close} aria-label={t("close")} title={t("close")}>×</button>
    </div>
  );
}

// Country picker above the list: flag + name. On a single-country map it just shows that country.
function CountryPicker({ value, locked, onChange }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const Label = ({ c }) => <><span className={`flag flag-${c === "all" ? "eu" : c}`} aria-hidden="true" />{t("country_" + c)}</>;
  return (
    <div className="cpick" ref={ref}>
      <button type="button" disabled={locked} aria-haspopup="listbox" aria-expanded={open} aria-label={`${t("listCountry")}: ${t("country_" + value)}`} onClick={() => setOpen((o) => !o)}>
        <Label c={value} />
      </button>
      {open && (
        <ul role="listbox" aria-label={t("listCountry")}>
          {["all", ...REAL].map((c) => (
            <li key={c}><button type="button" role="option" aria-selected={c === value} onClick={() => { onChange(c); setOpen(false); }}><Label c={c} /></button></li>
          ))}
        </ul>
      )}
    </div>
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

function Row({ tr, n, live, flag, notice }) {
  const { t } = useLang();
  const st = statusOf(tr, t);
  const late = !tr.cancelled && (tr.delay_min || 0) >= 5;
  const via = (tr.stops || []).slice(1, -1).map((s) => s.name);
  return (
    <Link href={trainHref(tr.id)} prefetch={false} className="row" aria-label={`${tr.type} ${tr.number}, ${tr.origin} – ${tr.destination}, ${st.label}`}>
      <div className="time num c-time">{late ? <>{fromMin(toMin(tr.dep) + tr.delay_min)}<s>{tr.dep}</s></> : tr.dep}</div>
      <div className="c-train"><div className="tnum num">{flag && <span className={`flag mini flag-${tr.country}`} aria-hidden="true" />}{tr.number || "–"}</div><span className="ttype">{tr.type}</span></div>
      <div className="route">
        <b>{tr.origin} → {tr.destination}{live && <span className="livetag">● {t("live")}</span>}{notice && <span className="noticetag" title={t("hasNotice")}>⚠ {t("hasNotice")}</span>}</b>
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
      <Link href={trainHref(tr.id)} prefetch={false} className="minirow">
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
          <LegendRow tall svg={<g className="legend-pin" transform="translate(17 26)"><PinShape /></g>} text={t("bigStation")} />
          <LegendRow tall svg={<g className="legend-pin" transform="translate(17 26)"><PinShape airport /></g>} text={t("airportStation")} />
          {[["ok", "tOk"], ["warn", "tWarn"], ["bad", "tBad"]].map(([c, k]) => (
            <LegendRow key={c} svg={<path d="M24 7L11 1.5L14 7L11 12.5Z" fill={`var(--${c})`} stroke="var(--surface)" strokeWidth="1.2" strokeLinejoin="round" />} text={t(k)} />
          ))}
        </div>
      </div>
      <p className="muted">{t("sideHint")}</p>
    </>
  );
}

function LegendRow({ svg, text, tall }) {
  return <div><svg width="34" height={tall ? 28 : 14} viewBox={tall ? "0 0 34 28" : "0 0 34 14"} aria-hidden="true">{svg}</svg><span>{text}</span></div>;
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
      const planned = plannedPf(s), pf = s.apf || planned;
      out.push({ tr, s, sub: pf ? `${sub} · ${t("pf", pf)}${s.apf && planned && s.apf !== planned ? " (" + t("pfChanged", planned) + ")" : ""}` : sub, m, past: now != null && m < now - 2 });
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
