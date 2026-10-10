"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useLang } from "@/components/LangProvider";
import { Avatar, PRESETS, avatarOf, PROFILE_FIELDS } from "@/components/Avatar";
import { LOCALES } from "@/lib/i18n";
import { KOFI_URL } from "@/lib/site";

const BUCKET_URL = "/storage/v1/object/public/avatars/";
const LEVELS = [[0, "lvl0"], [1, "lvl1"], [10, "lvl2"], [50, "lvl3"], [200, "lvl4"]]; // reports needed -> title
const COUNTRIES = ["ch", "fr", "de", "at", "es", "pt", "be", "nl", "lu"];
const EMPTY = { display_name: "", first_name: "", last_name: "", show_real_name: false, bio: "", home_station: "", home_country: "", fav_train: "" };

// A square 256 px picture, made in the browser before upload (small file, no camera data such as GPS)
async function squareImage(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob = (type, q) => new Promise((r) => c.toBlob(r, type, q));
  let b = await blob("image/webp", 0.85);
  if (!b || b.type !== "image/webp") b = await blob("image/jpeg", 0.88); // browsers that cannot write WebP
  return b;
}

export default function Account({ session, next, SetPassword }) {
  const { t, lang } = useLang();
  const sb = getBrowserClient();
  const uid = session.user.id;
  const meta = session.user.user_metadata || {};
  const googlePhoto = /^https:\/\/lh\d\.googleusercontent\.com\//.test(meta.avatar_url || meta.picture || "")
    ? (meta.avatar_url || meta.picture).replace(/=s\d+-c$/, "=s256-c") : null;

  const [p, setP] = useState(null); // saved profile
  const [f, setF] = useState(EMPTY); // form
  const [msg, setMsg] = useState(null);
  const [picMsg, setPicMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [access, setAccess] = useState(undefined);
  const [stations, setStations] = useState([]);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => {
    sb.from("profiles").select(PROFILE_FIELDS).eq("id", uid).maybeSingle().then(({ data }) => {
      if (!data) return;
      setP(data);
      // first and last name from the Google account as a suggestion; saved only when the user presses Save
      setF({
        ...EMPTY, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
        first_name: data.first_name ?? meta.given_name ?? "", last_name: data.last_name ?? meta.family_name ?? "",
      });
    });
    Promise.all([
      sb.from("comments").select("train_number", { count: "exact" }).eq("user_id", uid).limit(1000),
      sb.from("comments_feed").select("likes").eq("is_mine", true).limit(1000),
    ]).then(([c, l]) => setStats({
      reports: c.count || 0,
      trains: new Set((c.data || []).map((x) => x.train_number)).size,
      likes: (l.data || []).reduce((a, x) => a + (x.likes || 0), 0),
    }));
    sb.from("history_access").select("until").maybeSingle().then(({ data }) => setAccess(data?.until && Date.parse(data.until) > Date.now() ? data.until : null));
    sb.rpc("station_list").then(({ data }) => setStations(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const stationOptions = useMemo(() => {
    const seen = new Set();
    return stations.filter((s) => (!f.home_country || s.country === f.home_country) && !seen.has(s.name) && seen.add(s.name)).map((s) => s.name);
  }, [stations, f.home_country]);

  const level = useMemo(() => {
    const n = stats?.reports || 0;
    let i = 0;
    LEVELS.forEach(([min], k) => { if (n >= min) i = k; });
    const nextAt = LEVELS[i + 1]?.[0];
    return { key: LEVELS[i][1], nextAt, pct: nextAt ? Math.round(((n - LEVELS[i][0]) / (nextAt - LEVELS[i][0])) * 100) : 100, left: nextAt ? nextAt - n : 0 };
  }, [stats]);

  const shownName = (x) => (x?.show_real_name && x.first_name?.trim() ? `${x.first_name} ${x.last_name || ""}`.trim() : x?.display_name || "");
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "long", year: "numeric" });

  async function saveAvatar(patch, oldUrl) {
    setPicMsg(null);
    const { error } = await sb.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", uid);
    if (error) return setPicMsg({ err: true, text: error.message });
    setP((o) => ({ ...o, ...patch }));
    window.dispatchEvent(new Event("tp-profile"));
    // remove the previous uploaded photo, if there was one
    if (oldUrl && oldUrl.includes(BUCKET_URL) && oldUrl !== patch.avatar_url) {
      const path = oldUrl.split(BUCKET_URL)[1];
      if (path?.startsWith(uid + "/")) sb.storage.from("avatars").remove([path]);
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPicMsg({ err: true, text: t("picType") });
    if (file.size > 15 * 1024 * 1024) return setPicMsg({ err: true, text: t("picBig") });
    setBusy(true);
    try {
      const blob = await squareImage(file);
      const path = `${uid}/${Date.now()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (error) throw error;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      await saveAvatar({ avatar_url: url, avatar_preset: null }, p?.avatar_url);
    } catch (err) {
      setPicMsg({ err: true, text: t("picFail", err?.message || "") });
    }
    setBusy(false);
  }

  async function save(e) {
    e.preventDefault();
    const clean = (v, n) => (v || "").trim().replace(/\s+/g, " ").slice(0, n) || null;
    const row = {
      display_name: (f.display_name || "").trim(),
      first_name: clean(f.first_name, 40), last_name: clean(f.last_name, 40), show_real_name: !!f.show_real_name,
      bio: clean(f.bio, 160), home_station: clean(f.home_station, 80), home_country: f.home_country || null,
      fav_train: clean(f.fav_train, 20), updated_at: new Date().toISOString(),
    };
    if (row.display_name.length < 2 || row.display_name.length > 40) return setMsg({ err: true, text: t("nameLen") });
    if (row.show_real_name && !row.first_name) return setMsg({ err: true, text: t("realNameNeed") });
    setBusy(true);
    const { error } = await sb.from("profiles").update(row).eq("id", uid);
    setBusy(false);
    if (error) return setMsg({ err: true, text: error.message });
    setP((o) => ({ ...o, ...row }));
    setMsg({ err: false, text: t("saved") });
    window.dispatchEvent(new Event("tp-profile"));
  }

  if (!p) return <div className="narrow muted">{t("loading")}</div>;
  const current = avatarOf(p);
  const homeHref = p.home_station ? `/?${new URLSearchParams({ ...(p.home_country ? { c: p.home_country } : {}), station: p.home_station })}` : null;

  return (
    <div className="acct">
      {/* profile card: what other passengers see */}
      <section className="card acct-hero">
        <Avatar src={current} name={shownName(p)} size={96} />
        <div className="acct-id">
          <h2>{shownName(p)}</h2>
          <div className="acct-badges">
            <span className="lvl">{t(level.key)}</span>
            {p.home_station && <span className="chip-s">★ {p.home_station}</span>}
            {p.fav_train && <span className="chip-s">🚆 {p.fav_train}</span>}
          </div>
          {p.bio && <p className="acct-bio">{p.bio}</p>}
          <p className="note">{t("memberSince", fmtDate(p.created_at))} · {session.user.email}</p>
        </div>
        <Link className="acct-back" href={next}>{next === "/" ? t("backBoard") : t("backTrain")}</Link>
      </section>

      <div className="acct-grid">
        <div className="stack">
          {/* picture */}
          <section className="card stack">
            <h3>{t("picTitle")}</h3>
            <div className="frow" style={{ justifyContent: "flex-start" }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
              <button type="button" className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t("loading") : t("picUpload")}</button>
              {googlePhoto && <button type="button" className="ghost" disabled={busy || p.avatar_url === googlePhoto} onClick={() => saveAvatar({ avatar_url: googlePhoto, avatar_preset: null }, p.avatar_url)}>{t("picGoogle")}</button>}
              {current && <button type="button" className="linkish" disabled={busy} onClick={() => saveAvatar({ avatar_url: null, avatar_preset: null }, p.avatar_url)}>{t("picRemove")}</button>}
            </div>
            <p className="note">{t("picOr")}</p>
            <div className="presets" role="group" aria-label={t("picOr")}>
              {Object.keys(PRESETS).map((k) => (
                <button key={k} type="button" className="preset" aria-pressed={p.avatar_preset === k && !p.avatar_url} onClick={() => saveAvatar({ avatar_url: null, avatar_preset: k }, p.avatar_url)}>
                  <Avatar src={`preset:${k}`} size={44} />
                </button>
              ))}
            </div>
            {picMsg && <div className={`note${picMsg.err ? " err" : ""}`}>{picMsg.text}</div>}
          </section>

          {/* details */}
          <form className="card stack" onSubmit={save}>
            <h3>{t("aboutTitle")}</h3>
            <div className="two">
              <label className="fld"><span>{t("firstName")}</span><input className="input" value={f.first_name} maxLength={40} autoComplete="given-name" onChange={set("first_name")} /></label>
              <label className="fld"><span>{t("lastName")}</span><input className="input" value={f.last_name} maxLength={40} autoComplete="family-name" onChange={set("last_name")} /></label>
            </div>
            <label className="fld"><span>{t("nickLabel")}</span><input className="input" value={f.display_name} maxLength={40} required onChange={set("display_name")} /></label>
            <label className="check">
              <input type="checkbox" checked={!!f.show_real_name} onChange={set("show_real_name")} />
              <span>{t("showReal")}<br /><small className="muted">{t("showRealHint")}</small></span>
            </label>
            <label className="fld"><span>{t("bioLabel")} <small className="muted">({(f.bio || "").length}/160)</small></span>
              <textarea className="input" rows={2} maxLength={160} value={f.bio} placeholder={t("bioPh")} onChange={set("bio")} />
            </label>

            <h3 style={{ marginTop: 6 }}>{t("travelTitle")}</h3>
            <div className="fld"><span>{t("homeCountry")}</span>
              <div className="seg" role="group">
                {COUNTRIES.map((c) => (
                  <button key={c} type="button" className="chipbtn" aria-pressed={f.home_country === c} onClick={() => setF((o) => ({ ...o, home_country: o.home_country === c ? "" : c }))}>
                    <span className={`flag flag-${c}`} aria-hidden="true" />{t("country_" + c)}
                  </button>
                ))}
              </div>
              <small className="muted">{t("homeCountryHint")}</small>
            </div>
            <label className="fld"><span>{t("homeStation")}</span>
              <input className="input" list="stationlist" value={f.home_station} maxLength={80} placeholder={t("homeStationPh")} onChange={set("home_station")} />
              <datalist id="stationlist">{stationOptions.map((n) => <option key={n} value={n} />)}</datalist>
              <small className="muted">{t("homeStationHint")}</small>
            </label>
            <label className="fld"><span>{t("favTrain")}</span>
              <input className="input" value={f.fav_train} maxLength={20} placeholder="TGV 9203, IC 1, EC 9…" onChange={set("fav_train")} />
            </label>
            <div className="frow">
              <button className="primary" type="submit" disabled={busy}>{t("saveProfile")}</button>
              {homeHref && <Link href={homeHref}>{t("openStation", p.home_station)}</Link>}
            </div>
            {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
          </form>
        </div>

        <div className="stack">
          {/* activity */}
          <section className="card stack">
            <h3>{t("statsTitle")}</h3>
            <div className="minstats">
              <div><b>{stats ? stats.reports : "–"}</b><span>{t("stReports")}</span></div>
              <div><b>{stats ? stats.trains : "–"}</b><span>{t("stTrains")}</span></div>
              <div><b>{stats ? stats.likes : "–"}</b><span>{t("stLikes")}</span></div>
            </div>
            <div>
              <div className="lvlbar" aria-hidden="true"><i style={{ width: `${level.pct}%` }} /></div>
              <p className="note">{level.nextAt ? t("lvlNext", level.left, t(LEVELS.find(([m]) => m === level.nextAt)[1])) : t("lvlTop")}</p>
            </div>
          </section>

          {/* earlier days */}
          <section className="card stack">
            <h3>{t("histCard")}</h3>
            {access === undefined ? <p className="muted">{t("loading")}</p> : access
              ? <p className="okline">✓ {t("histActive", fmtDate(access))}</p>
              : <p className="muted">{t("histNone")}</p>}
            <a className="ghost" style={{ textAlign: "center", textDecoration: "none" }} href={KOFI_URL} target="_blank" rel="noopener noreferrer">{access ? t("histExtend") : t("histPay")}</a>
            <p className="note">{t("histSameEmail", session.user.email)}</p>
          </section>

          {/* sign-in */}
          <section className="card stack">
            <h3>{t("securityTitle")}</h3>
            <p className="muted">{t("signedInAs", session.user.email)}</p>
            <SetPassword />
            <button className="ghost" type="button" onClick={() => sb.auth.signOut()}>{t("signOut")}</button>
          </section>
        </div>
      </div>
    </div>
  );
}
