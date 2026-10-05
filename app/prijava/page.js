"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient, isConfigured } from "@/lib/supabase";
import { useSession } from "@/components/useSession";
import { useLang } from "@/components/LangProvider";
import Account from "@/components/Account";

// Sign-in: Google, email + own password, or a sign-in link by email. Passwords are kept by Supabase Auth
// (hashed); the site never sees or stores them.
export default function LoginPage() {
  const { t } = useLang();
  const { session, ready } = useSession();
  const [next, setNext] = useState("/");
  const [recovery, setRecovery] = useState(false); // came from a "choose a new password" email

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
    if (q.get("reset") === "1") setRecovery(true);
    const sb = getBrowserClient();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <div className="notice narrow">{t("notConfigured")}</div>;
  if (!ready) return <div className="narrow muted">{t("loading")}</div>;
  if (session && recovery) return <NewPassword onDone={() => setRecovery(false)} />;
  return session ? <Account session={session} next={next} SetPassword={SetPassword} /> : <SignIn next={next} />;
}

const back = (next, extra = "") => `${window.location.origin}/prijava?next=${encodeURIComponent(next)}${extra}`;

function SignIn({ next }) {
  const { t } = useLang();
  const sb = getBrowserClient();
  const [tab, setTab] = useState("password"); // password | link
  const [mode, setMode] = useState("in"); // in | up (create account)
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [state, setState] = useState({ busy: false, ok: null, err: null });
  const ok = email.includes("@");

  const fail = (error) => {
    const m = error?.message || "";
    if (/invalid login credentials/i.test(m)) return t("badLogin");
    if (/email not confirmed/i.test(m)) return t("emailNotConfirmed");
    if (/provider is not enabled|unsupported provider/i.test(m)) return t("googleOff");
    if (/password should be at least|weak password/i.test(m)) return t("pwShort");
    return t("sendFail", m);
  };

  async function google() {
    setState({ busy: true, ok: null, err: null });
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back(next) } });
    if (error) setState({ busy: false, ok: null, err: fail(error) });
  }

  async function withPassword(e) {
    e.preventDefault();
    if (mode === "up" && pw.length < 8) return setState({ busy: false, ok: null, err: t("pwShort") });
    setState({ busy: true, ok: null, err: null });
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
      setState({ busy: false, ok: null, err: error ? fail(error) : null });
    } else {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: back(next) } });
      if (error) return setState({ busy: false, ok: null, err: fail(error) });
      setState({ busy: false, ok: data.session ? null : t("signUpSent", email.trim()), err: null });
    }
  }

  async function forgot() {
    if (!ok) return setState({ busy: false, ok: null, err: t("emailFirst") });
    setState({ busy: true, ok: null, err: null });
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: back(next, "&reset=1") });
    setState({ busy: false, ok: error ? null : t("resetSent", email.trim()), err: error ? fail(error) : null });
  }

  async function link(e) {
    e.preventDefault();
    setState({ busy: true, ok: null, err: null });
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back(next) } });
    setState({ busy: false, ok: error ? null : t("sent", email.trim()), err: error ? fail(error) : null });
  }

  return (
    <section className="narrow card stack authbox">
      <h2>{mode === "up" && tab === "password" ? t("signUpTitle") : t("loginTitle")}</h2>
      <button type="button" className="googlebtn" onClick={google} disabled={state.busy}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {t("google")}
      </button>
      <div className="orline"><span>{t("or")}</span></div>
      <div className="seg authtabs" role="tablist">
        <button type="button" role="tab" className="chipbtn" aria-pressed={tab === "password"} onClick={() => { setTab("password"); setState({ busy: false, ok: null, err: null }); }}>{t("tabPassword")}</button>
        <button type="button" role="tab" className="chipbtn" aria-pressed={tab === "link"} onClick={() => { setTab("link"); setState({ busy: false, ok: null, err: null }); }}>{t("tabLink")}</button>
      </div>
      {state.ok ? <p className="note">{state.ok}</p> : tab === "password" ? (
        <form className="stack" onSubmit={withPassword}>
          <label htmlFor="email" className="muted">{t("emailLabel")}</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          <label htmlFor="pw" className="muted">{mode === "up" ? t("pwNew") : t("pwLabel")}</label>
          <input id="pw" className="input" type="password" required minLength={mode === "up" ? 8 : undefined} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="primary" type="submit" disabled={state.busy || !ok || !pw}>{state.busy ? t("loading") : mode === "up" ? t("signUpBtn") : t("signIn")}</button>
          <div className="frow authlinks">
            <button type="button" className="linkish" onClick={() => { setMode(mode === "in" ? "up" : "in"); setState({ busy: false, ok: null, err: null }); }}>{mode === "in" ? t("noAccount") : t("haveAccount")}</button>
            {mode === "in" && <button type="button" className="linkish" onClick={forgot}>{t("forgot")}</button>}
          </div>
        </form>
      ) : (
        <form className="stack" onSubmit={link}>
          <p className="muted">{t("loginIntro")}</p>
          <label htmlFor="email2" className="muted">{t("emailLabel")}</label>
          <input id="email2" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          <button className="primary" type="submit" disabled={state.busy || !ok}>{state.busy ? t("sending") : t("sendLink")}</button>
        </form>
      )}
      {state.err && <div className="note err">{state.err}</div>}
      <p className="note"><Link href="/privacy">{t("loginPrivacy")}</Link></p>
    </section>
  );
}

// After "Forgot password?": the email link signs the user in, then they choose the new password here
function NewPassword({ onDone }) {
  const { t } = useLang();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ err: true, text: t("pwShort") });
    const { error } = await getBrowserClient().auth.updateUser({ password: pw });
    if (error) return setMsg({ err: true, text: error.message });
    setMsg({ err: false, text: t("pwSaved") });
    setTimeout(onDone, 1200);
  }
  return (
    <section className="narrow card stack">
      <h2>{t("newPwTitle")}</h2>
      <form className="stack" onSubmit={save}>
        <label htmlFor="npw" className="muted">{t("pwNew")}</label>
        <input id="npw" className="input" type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="primary" type="submit">{t("savePw")}</button>
        {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
      </form>
    </section>
  );
}

// Signed in with Google or an email link: a password can be added (or changed) to sign in that way too
function SetPassword() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ err: true, text: t("pwShort") });
    const { error } = await getBrowserClient().auth.updateUser({ password: pw });
    setMsg(error ? { err: true, text: error.message } : { err: false, text: t("pwSaved") });
    if (!error) setPw("");
  }
  if (!open) return <button type="button" className="linkish" onClick={() => setOpen(true)}>{t("setPw")}</button>;
  return (
    <form className="stack" onSubmit={save}>
      <p className="muted">{t("setPwHint")}</p>
      <label htmlFor="spw" className="muted">{t("pwNew")}</label>
      <input id="spw" className="input" type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="primary" type="submit">{t("savePw")}</button>
      {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
    </form>
  );
}
