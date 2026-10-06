"use client";

import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useSession } from "@/components/useSession";
import { TRAIN_FIELDS, statusOf, toMin, parisTime, parisNowMin, ago, plannedPf, isScheduleOnly, localNowMin } from "@/lib/format";
import { REASON_KEYS } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";
import TrainMap from "@/components/TrainMap";
import { getGeo } from "@/lib/geo";
import { fetchAlertsForTrain } from "@/lib/queries";

// The train's own country map, or all countries together when the trip leaves that country
const routeMapFor = (train) => (getGeo(train.country || "fr").fitsTrain(train) ? train.country || "fr" : "all");

// Notices come as simple HTML from the railway: keep only the text, one paragraph per block (never inject their HTML)
// A removed tag becomes a space, then spaces are tidied up. SNCF's English text also glues words to its template
// ("Maintenance workat Paris Est", "click on:Train breakdown"): those get their space back
const paragraphs = (html) => (html || "").replace(/<br\s*\/?>/gi, "\n").split(/<\/p>|<\/div>|<\/li>|\n/i)
  .map((p) => p.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, "\"")
    .replace(/([a-zà-ÿ])([.:;!?])(?=[A-ZÀ-Ý])/g, "$1$2 ").replace(/([a-z]{3,})at (?=[A-ZÀ-Ý])/g, "$1 at ").replace(/\s+([.,:;!?])(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim()).filter(Boolean);

const SITE_LANGS = ["en", "de", "fr", "nl", "es"];
const LANG_NAMES = { en: "English", de: "Deutsch", fr: "Français", it: "Italiano", nl: "Nederlands", es: "Español" };
// Official languages of each country: a notice the railway published in the reader's language counts as original there
const OFFICIAL = { fr: ["fr"], ch: ["de", "fr", "it"], be: ["nl", "fr", "de"], nl: ["nl"], lu: ["fr", "de"], es: ["es"], pt: ["pt"] };
const SOURCE = { fr: "SNCF", ch: "opentransportdata.swiss", be: "SNCB / NMBS", nl: "NS / NDOV", lu: "CFL / mobiliteit.lu", es: "Renfe", pt: "CP" };
const gtranslate = (text, to) => `https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(text.slice(0, 4500))}&op=translate`;

// The train's route on a large map, over the whole page (opened from the small route map; Esc or × closes it)
function BigRouteMap({ train, onClose }) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind does not scroll
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return (
    <div className="mapmodal" role="dialog" aria-modal="true" aria-label={`${t("routeMap")}: ${train.type} ${train.number}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mapmodal-box">
        <div className="mapmodal-head">
          <h3>{train.type} {train.number} <span className="muted">· {train.origin} → {train.destination}</span></h3>
          <button type="button" className="mapmodal-close" onClick={onClose} aria-label={t("close")} title={t("close")}>×</button>
        </div>
        <TrainMap country={routeMapFor(train)} trains={[train]} highlight={train} compact big />
      </div>
    </div>
  );
}

// Shown in the railway's original language first; the reader can switch to the other site languages.
// Uses the railway's own translation when the feed has one, otherwise offers a Google Translate link.
function OfficialNotices({ alerts: all }) {
  const { t, lang } = useLang();
  // the same notice can arrive twice (e.g. under an old and a new id): show it once
  const alerts = all.filter((a, i) => all.findIndex((b) => b.country === a.country && b.header === a.header && b.description === a.description) === i);
  const [view, setView] = useState("orig");
  const time = (iso) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : lang, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  // the original language shown first: the reader's own language when it is official in that country and the railway published it
  const origOf = (a) => {
    const official = OFFICIAL[a.country] || [];
    if (official.includes(lang) && (a.header_tr?.[lang] || a.description_tr?.[lang])) return lang;
    return a.orig_lang || official[0] || "fr";
  };
  const origs = [...new Set(alerts.map(origOf))];
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
        const orig = origOf(a);
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
                {want !== orig && !(OFFICIAL[a.country] || []).includes(want) && <p className="muted small">{t("noticeTranslatedBy")}</p>}
              </>
            ) : (
              <>
                {(hTr[orig] || a.header) && <b>{hTr[orig] || a.header}</b>}
                {paragraphs(dTr[orig] || a.description).map((p, i) => <p key={i}>{p}</p>)}
                <p className="small"><a href={gtranslate(origText, want)} target="_blank" rel="noopener noreferrer">{t("noticeGoogle", LANG_NAMES[want])} ↗</a></p>
              </>
            )}
            <p className="muted small">{t("officialSource", SOURCE[a.country] || "SNCF")} · {t("noticeOriginal")}: {LANG_NAMES[orig] || orig.toUpperCase()}{a.active_from && !(a.country === "be" && a.cause === 10) ? ` · ${t("officialSince", time(a.active_from))}` : ""}</p>
          </div>
        );
      })}
    </section>
  );
}

const COMMENT_FIELDS = "id,kind,reason,rating,body,onboard,created_at,author_name,author_avatar,is_mine,likes,liked";

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
  const [bigMap, setBigMap] = useState(false);
  useEffect(() => { setDeparted(localNowMin(train.country) >= toMin(train.dep) + (train.stops?.[0]?.delay || 0)); }, [train]);
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
              <div className="n num">{train.cancelled ? t("cancelled") : isScheduleOnly(train) ? t("schedLbl") : train.delay_min ? `+${train.delay_min} min` : t("onTimeLbl")}</div>
              <div className="muted">
                <span className={`pill ${st.cls}`}>{st.label}</span>
                <div>{train.rt_updated_at ? t("updated", ago(train.rt_updated_at, t, lang)) : isScheduleOnly(train) ? t("schedShort") : departed === false ? t("notStarted") : t("noReport")}</div>
              </div>
            </div>
            {isScheduleOnly(train) && <p className="infobox sched small" role="note"><span aria-hidden="true">💬</span> {t("schedTrainAsk", t("country_" + train.country))}</p>}
          </section>

          <Stops train={train} />

          {alerts.length > 0 && <OfficialNotices alerts={alerts} />}

          <section className="card">
            <h3>{t("routeMap")}</h3>
            <TrainMap country={routeMapFor(train)} trains={[train]} highlight={train} compact onExpand={() => setBigMap(true)} />
          </section>
          {bigMap && <BigRouteMap train={train} onClose={() => setBigMap(false)} />}

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
                {comments.map((c) => <Comment key={c.id} c={c} onDeleted={load} onLiked={load} reasonLabel={reasonLabel} />)}
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
              <Platform s={s} />
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

// Platform of a stop: "Pl. 7", or a changed one in red with the planned one struck through
export function Platform({ s }) {
  const { t } = useLang();
  const planned = plannedPf(s);
  if (s.apf && planned && s.apf !== planned) return <span className="pf changed" title={t("pfChanged", planned)}>{t("pf", s.apf)}<s>{planned}</s></span>;
  const pf = s.apf || planned;
  return <span className="pf">{pf ? t("pf", pf) : ""}</span>;
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

// "True" button: passengers confirm a report they can see is right (one per account, can be taken back)
function LikeButton({ c, onLiked }) {
  const { t } = useLang();
  const { session } = useSession();
  const [state, setState] = useState({ liked: !!c.liked, likes: c.likes || 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState({ liked: !!c.liked, likes: c.likes || 0 }); }, [c.liked, c.likes]);
  if (c.is_mine) return state.likes ? <span className="likecount">✓ {t("likeTrue")} · {state.likes}</span> : null;
  async function toggle() {
    if (!session || busy) return;
    setBusy(true);
    const sb = getBrowserClient();
    const next = { liked: !state.liked, likes: state.likes + (state.liked ? -1 : 1) };
    setState(next); // show it at once
    const { error } = state.liked
      ? await sb.from("comment_likes").delete().eq("comment_id", c.id).eq("user_id", session.user.id)
      : await sb.from("comment_likes").insert({ comment_id: c.id, user_id: session.user.id });
    if (error) setState(state);
    setBusy(false);
    onLiked?.();
  }
  return (
    <button type="button" className="likebtn" aria-pressed={state.liked} disabled={!session} onClick={toggle}
      title={session ? t("likeHint") : t("likeSignIn")}>
      ✓ {t("likeTrue")}{state.likes ? ` · ${state.likes}` : ""}
    </button>
  );
}

function Comment({ c, onDeleted, onLiked, reasonLabel }) {
  const { t, lang } = useLang();
  const [confirm, setConfirm] = useState(false);
  async function remove() {
    await getBrowserClient().from("comments").delete().eq("id", c.id);
    onDeleted();
  }
  return (
    <li className="cm plain">
      <div className="who">
        <Avatar src={c.author_avatar} name={c.author_name || "?"} size={28} />
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
      <div className="cm-actions"><LikeButton c={c} onLiked={onLiked} /></div>
    </li>
  );
}
