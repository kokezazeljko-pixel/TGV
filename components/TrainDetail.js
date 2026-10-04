"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useSession } from "@/components/useSession";
import { TRAIN_FIELDS, statusOf, toMin, parisTime, parisNowMin, ago } from "@/lib/format";
import { REASON_KEYS } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";
import TrainMap from "@/components/TrainMap";
import { getGeo } from "@/lib/geo";
import { fetchAlertsForTrain } from "@/lib/queries";

// The train's own country map, or France + Switzerland together when the trip leaves that country
const routeMapFor = (train) => (getGeo(train.country || "fr").fitsTrain(train) ? train.country || "fr" : "all");

// Notices come as simple HTML from the railway: keep only the text, one paragraph per block (never inject their HTML)
const paragraphs = (html) => (html || "").replace(/<br\s*\/?>/gi, "\n").split(/<\/p>|\n/i)
  .map((p) => p.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, "\"").trim()).filter(Boolean);

const SITE_LANGS = ["en", "de", "fr"];
const LANG_NAMES = { en: "English", de: "Deutsch", fr: "Français", it: "Italiano" };
const gtranslate = (text, to) => `https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(text.slice(0, 4500))}&op=translate`;

// Shown in the railway's original language first; the reader can switch to the other site languages.
// Uses the railway's own translation when the feed has one, otherwise offers a Google Translate link.
function OfficialNotices({ alerts }) {
  const { t, lang } = useLang();
  const [view, setView] = useState("orig");
  const time = (iso) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : lang, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const origs = [...new Set(alerts.map((a) => a.orig_lang || (a.country === "ch" ? "de" : "fr")))];
  const choices = SITE_LANGS.filter((l) => !(origs.length === 1 && origs[0] === l));
  return (
    <section className="card notice-official">
      <h3><span className="warn-ico" aria-hidden="true">⚠</span> {t("officialTitle")}</h3>
      <div className="notice-langs" role="group" aria-label={t("noticeLang")}>
        <button type="button" className={view === "orig" ? "on" : ""} aria-pressed={view === "orig"} onClick={() => setView("orig")}>
          {t("noticeOriginal")} ({origs.map((o) => o.toUpperCase()).join("/")})
        </button>
        {choices.map((l) => (
          <button key={l} type="button" className={view === l ? "on" : ""} aria-pressed={view === l} onClick={() => setView(l)} title={LANG_NAMES[l]}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {alerts.map((a) => {
        const orig = a.orig_lang || (a.country === "ch" ? "de" : "fr");
        const want = view === "orig" ? orig : view;
        const hTr = a.header_tr || {}, dTr = a.description_tr || {};
        const has = want === orig || hTr[want] || dTr[want];
        const header = want === orig ? (hTr[orig] || a.header) : (hTr[want] || "");
        const desc = want === orig ? (dTr[orig] || a.description) : (dTr[want] || "");
        const origText = [hTr[orig] || a.header, paragraphs(dTr[orig] || a.description).join("\n")].filter(Boolean).join("\n\n");
        return (
          <div key={a.id} className="alert-item">
            {has ? (
              <>
                {header && <b>{header}</b>}
                {paragraphs(desc).map((p, i) => <p key={i}>{p}</p>)}
                {want !== orig && <p className="muted small">{t("noticeTranslatedBy")}</p>}
              </>
            ) : (
              <>
                {(hTr[orig] || a.header) && <b>{hTr[orig] || a.header}</b>}
                {paragraphs(dTr[orig] || a.description).map((p, i) => <p key={i}>{p}</p>)}
                <p className="small"><a href={gtranslate(origText, want)} target="_blank" rel="noopener noreferrer">{t("noticeGoogle", LANG_NAMES[want])} ↗</a></p>
              </>
            )}
            <p className="muted small">{t("officialSource", a.country === "ch" ? "opentransportdata.swiss" : "SNCF")} · {t("noticeOriginal")}: {LANG_NAMES[orig] || orig.toUpperCase()}{a.active_from ? ` · ${t("officialSince", time(a.active_from))}` : ""}</p>
          </div>
        );
      })}
    </section>
  );
}

const COMMENT_FIELDS = "id,kind,reason,rating,body,onboard,created_at,author_name,is_mine";

export default function TrainDetail({ initialTrain }) {
  const { t, lang } = useLang();
  const reasonLabel = (k) => t("reasons")[k] || k;
  const [train, setTrain] = useState(initialTrain);
  const [comments, setComments] = useState([]);
  const [lineRatings, setLineRatings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const routeKey = `${train.origin} – ${train.destination}`;

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    if (!sb) return;
    const [{ data: t }, { data: c }, { data: r }, al] = await Promise.all([
      sb.from("trains").select(TRAIN_FIELDS).eq("id", initialTrain.id).maybeSingle(),
      sb.from("comments_feed").select(COMMENT_FIELDS).eq("train_id", initialTrain.id).order("created_at", { ascending: false }).limit(200),
      sb.from("comments_feed").select("rating").eq("route_key", routeKey).not("rating", "is", null).order("created_at", { ascending: false }).limit(500),
      fetchAlertsForTrain(sb, initialTrain.id),
    ]);
    setAlerts(al);
    if (t) setTrain(t);
    if (c) setComments(c);
    if (r) setLineRatings(r.map((x) => x.rating));
    setLoaded(true);
  }, [initialTrain.id, routeKey]);

  // First load, then refresh every 30 seconds
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const st = statusOf(train, t);
  // Has the train left its first station yet? (computed in the browser, Paris time)
  const [departed, setDeparted] = useState(null);
  useEffect(() => { setDeparted(parisNowMin() >= toMin(train.dep) + (train.stops?.[0]?.delay || 0)); }, [train]);
  const tally = useMemo(() => {
    const m = {};
    for (const c of comments) if (c.reason) m[c.reason] = (m[c.reason] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [comments]);
  const avgRating = lineRatings.length ? lineRatings.reduce((a, b) => a + b, 0) / lineRatings.length : null;

  return (
    <>
      <Link href="/" className="back">{t("allTrains")}</Link>
      <div className="thead">
        <div>
          <h2>{train.type} {train.number}</h2>
          <p>{train.origin} → {train.destination} · {t("departsArrives", train.dep, train.arr)}</p>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="card">
            <div className="bigdelay">
              <div className="n num">{train.cancelled ? t("cancelled") : train.delay_min ? `+${train.delay_min} min` : t("onTimeLbl")}</div>
              <div className="muted">
                <span className={`pill ${st.cls}`}>{st.label}</span>
                <div>{train.rt_updated_at ? t("updated", ago(train.rt_updated_at, t, lang)) : departed === false ? t("notStarted") : t("noReport")}</div>
              </div>
            </div>
          </section>

          <Stops train={train} />

          {alerts.length > 0 && <OfficialNotices alerts={alerts} />}

          <section className="card">
            <h3>{t("routeMap")}</h3>
            <TrainMap country={routeMapFor(train)} trains={[train]} highlight={train} compact />
          </section>

          <section className="card">
            <h3>{t("whyTitle")}</h3>
            {!tally.length ? (
              <p className="muted">{t("whyEmpty")}</p>
            ) : (
              <div className="reasons">
                {tally.map(([k, v]) => (
                  <div className="rbar" key={k}>
                    <span>{reasonLabel(k)}</span>
                    <div className="track"><div className="fill" style={{ width: `${(v / tally[0][1]) * 100}%` }} /></div>
                    <span className="c num">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {avgRating != null && (
              <p className="muted">{t("lineRating", routeKey, avgRating.toFixed(1), lineRatings.length)}</p>
            )}
          </section>
        </div>

        <div className="col">
          <CommentForm train={train} routeKey={routeKey} onPosted={load} />
          <section className="card">
            <h3>{t("reportsTitle", comments.length)}</h3>
            {!loaded ? (
              <p className="muted">{t("loadingReports")}</p>
            ) : !comments.length ? (
              <p className="muted">{t("reportsEmpty")}</p>
            ) : (
              <ul className="clist">
                {comments.map((c) => <Comment key={c.id} c={c} onDeleted={load} reasonLabel={reasonLabel} />)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Stops({ train }) {
  const { t } = useLang();
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(toMin(parisTime())); }, [train]);
  if (!train.stops?.length) return null;
  return (
    <section className="card">
      <h3>{t("stops")}</h3>
      <ol className="stops">
        {train.stops.map((s, i) => {
          const est = toMin(s.time) + (s.delay || 0);
          const cls = [now != null && est <= now ? "past" : "", s.skipped ? "skipped" : ""].join(" ").trim();
          const dcls = s.delay >= 15 ? "d-bad" : s.delay >= 5 ? "d-warn" : "d-ok";
          return (
            <li key={`${s.seq ?? i}`} className={cls}>
              <span className="dot" />
              <span>{s.name}</span>
              <span className="t num">
                {s.time}
                {s.skipped ? <em className="d-bad">{t("skipped")}</em> : s.delay ? <em className={dcls}>+{s.delay}</em> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CommentForm({ train, routeKey, onPosted }) {
  const { t } = useLang();
  const { session, ready } = useSession();
  const [kind, setKind] = useState("razlog");
  const [reason, setReason] = useState(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [onboard, setOnboard] = useState(true);
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!ready) return <section className="card"><h3>{t("share")}</h3><p className="muted">{t("loading")}</p></section>;
  if (!session) {
    return (
      <section className="card">
        <h3>{t("share")}</h3>
        <p className="muted">{t("signInToPost")}</p>
        <Link className="primary" href={`/prijava?next=${encodeURIComponent(`/voz/${encodeURIComponent(train.id)}`)}`}>{t("signIn")}</Link>
      </section>
    );
  }

  async function submit(e) {
    e.preventDefault();
    const text = body.trim();
    if (kind === "razlog" && !reason && !text) return setMsg({ err: true, text: t("errReason") });
    if (kind === "utisak" && !rating && !text) return setMsg({ err: true, text: t("errReview") });
    setBusy(true); setMsg(null);
    const { error } = await getBrowserClient().from("comments").insert({
      train_id: train.id,
      train_number: train.number,
      service_date: train.service_date,
      route_key: routeKey,
      kind,
      reason: kind === "razlog" ? reason : null,
      rating: kind === "utisak" && rating ? rating : null,
      body: text,
      onboard,
      anon,
    });
    setBusy(false);
    if (error) {
      setMsg({ err: true, text: error.message.includes("Sačekaj") ? t("wait20") : t("errGeneric", error.message) });
      return;
    }
    setBody(""); setReason(null); setRating(0);
    setMsg({ err: false, text: t("posted") });
    onPosted();
  }

  return (
    <section className="card">
      <h3>{t("share")}</h3>
      <form className="cform" onSubmit={submit} noValidate>
        <div className="seg" role="group" aria-label={t("kindGroup")}>
          <button type="button" className="chipbtn" aria-pressed={kind === "razlog"} onClick={() => setKind("razlog")}>{t("kReason")}</button>
          <button type="button" className="chipbtn" aria-pressed={kind === "utisak"} onClick={() => setKind("utisak")}>{t("kReview")}</button>
        </div>
        {kind === "razlog" ? (
          <div className="reasonpick">
            {REASON_KEYS.map((r) => (
              <button key={r} type="button" className="chipbtn" aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{t("reasons")[r]}</button>
            ))}
          </div>
        ) : (
          <div className="stars" role="group" aria-label={t("rating")}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" className={i <= rating ? "on" : ""} aria-label={t("of5", i)} onClick={() => setRating(i)}>★</button>
            ))}
          </div>
        )}
        <textarea
          id="c-text"
          maxLength={600}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label={t("yourComment")}
          placeholder={kind === "razlog" ? t("phReason") : t("phReview")}
        />
        <div className="frow">
          <div style={{ display: "grid", gap: 4 }}>
            <label className="check"><input type="checkbox" id="c-onboard" checked={onboard} onChange={(e) => setOnboard(e.target.checked)} /> {t("onboard")}</label>
            <label className="check"><input type="checkbox" id="c-anon" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> {t("anon")}</label>
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? t("posting") : t("post")}</button>
        </div>
        {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
      </form>
    </section>
  );
}

function Comment({ c, onDeleted, reasonLabel }) {
  const { t, lang } = useLang();
  const [confirm, setConfirm] = useState(false);
  async function remove() {
    await getBrowserClient().from("comments").delete().eq("id", c.id);
    onDeleted();
  }
  return (
    <li className="cm">
      <div className="who">
        {c.author_name || t("anonName")}
        <span className="when">{ago(c.created_at, t, lang)}</span>
        {c.is_mine && !confirm && <button className="linkbtn" type="button" onClick={() => setConfirm(true)}>{t("del")}</button>}
        {c.is_mine && confirm && (
          <>
            <button className="linkbtn" type="button" onClick={remove}>{t("confirmDel")}</button>
            <button className="linkbtn" type="button" onClick={() => setConfirm(false)}>{t("cancel")}</button>
          </>
        )}
      </div>
      <div className="tags">
        {c.onboard && <span className="tag board">{t("tagBoard")}</span>}
        {c.reason && <span className="tag">{reasonLabel(c.reason)}</span>}
        {c.kind === "utisak" && <span className="tag">{t("tagReview")}</span>}
        {c.rating ? <span className="minis" aria-label={t("of5", c.rating)}>{"★".repeat(c.rating)}{"☆".repeat(5 - c.rating)}</span> : null}
      </div>
      {c.body && <p>{c.body}</p>}
    </li>
  );
}
