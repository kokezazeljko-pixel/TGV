"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient, isConfigured } from "@/lib/supabase";
import { useSession } from "@/components/useSession";
import { useLang } from "@/components/LangProvider";

// Passwordless sign-in: the user enters an email and receives a sign-in link
export default function LoginPage() {
  const { t } = useLang();
  const { session, ready } = useSession();
  const [next, setNext] = useState("/");

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
  }, []);

  if (!isConfigured) return <div className="notice narrow">{t("notConfigured")}</div>;
  if (!ready) return <div className="narrow muted">{t("loading")}</div>;
  return session ? <Account session={session} next={next} /> : <EmailForm next={next} />;
}

function EmailForm({ next }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ busy: false, sent: false, err: null });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, sent: false, err: null });
    const redirect = `${window.location.origin}/prijava?next=${encodeURIComponent(next)}`;
    const { error } = await getBrowserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
    setState({ busy: false, sent: !error, err: error?.message || null });
  }

  return (
    <section className="narrow card">
      <h2>{t("loginTitle")}</h2>
      {state.sent ? (
        <p>{t("sent", email)}</p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted">{t("loginIntro")}</p>
          <label htmlFor="email" className="muted">{t("emailLabel")}</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          <button className="primary" type="submit" disabled={state.busy || !email.includes("@")}>{state.busy ? t("sending") : t("sendLink")}</button>
          {state.err && <div className="note err">{t("sendFail", state.err)}</div>}
        </form>
      )}
    </section>
  );
}

function Account({ session, next }) {
  const { t } = useLang();
  const sb = getBrowserClient();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    sb.from("profiles").select("display_name").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) setName(data.display_name);
    });
  }, [sb, session.user.id]);

  async function save(e) {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 40) return setMsg({ err: true, text: t("nameLen") });
    const { error } = await sb.from("profiles").update({ display_name: clean }).eq("id", session.user.id);
    setMsg(error ? { err: true, text: error.message } : { err: false, text: t("saved") });
  }

  return (
    <section className="narrow card stack">
      <h2>{t("myAccount")}</h2>
      <p className="muted">{t("signedInAs", session.user.email)}</p>
      <form className="stack" onSubmit={save}>
        <label htmlFor="name" className="muted">{t("nameLabel")}</label>
        <input id="name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <div className="frow">
          <button className="primary" type="submit">{t("saveName")}</button>
          <Link href={next}>{next === "/" ? t("backBoard") : t("backTrain")}</Link>
        </div>
        {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
      </form>
      <button className="ghost" type="button" onClick={() => sb.auth.signOut()}>{t("signOut")}</button>
    </section>
  );
}
