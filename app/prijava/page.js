"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient, isConfigured } from "@/lib/supabase";
import { useSession } from "@/components/useSession";

// Prijava bez lozinke: korisnik upiše email i dobije link za prijavu
export default function LoginPage() {
  const { session, ready } = useSession();
  const [next, setNext] = useState("/");

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
  }, []);

  if (!isConfigured) return <div className="notice narrow">Sajt još nije povezan sa bazom (README.md, korak 2).</div>;
  if (!ready) return <div className="narrow muted">Učitavam…</div>;
  return session ? <Account session={session} next={next} /> : <EmailForm next={next} />;
}

function EmailForm({ next }) {
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
      <h2>Prijava</h2>
      {state.sent ? (
        <p>Poslali smo link na <b>{email}</b>. Otvori email i klikni na link, pa se vraćaš ovde prijavljen.</p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted">Upiši email i poslaćemo ti link za prijavu. Lozinka nije potrebna.</p>
          <label htmlFor="email" className="muted">Email adresa</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ime@primer.com" />
          <button className="primary" type="submit" disabled={state.busy || !email.includes("@")}>{state.busy ? "Šaljem…" : "Pošalji link"}</button>
          {state.err && <div className="note err">Slanje nije uspelo: {state.err}</div>}
        </form>
      )}
    </section>
  );
}

function Account({ session, next }) {
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
    if (clean.length < 2 || clean.length > 40) return setMsg({ err: true, text: "Ime treba da ima od 2 do 40 slova." });
    const { error } = await sb.from("profiles").update({ display_name: clean }).eq("id", session.user.id);
    setMsg(error ? { err: true, text: error.message } : { err: false, text: "Sačuvano." });
  }

  return (
    <section className="narrow card stack">
      <h2>Moj nalog</h2>
      <p className="muted">Prijavljen si kao {session.user.email}.</p>
      <form className="stack" onSubmit={save}>
        <label htmlFor="name" className="muted">Ime koje drugi putnici vide uz tvoje komentare</label>
        <input id="name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <div className="frow">
          <button className="primary" type="submit">Sačuvaj ime</button>
          <Link href={next}>{next === "/" ? "Na tablu polazaka →" : "Nazad na voz →"}</Link>
        </div>
        {msg && <div className={`note${msg.err ? " err" : ""}`}>{msg.text}</div>}
      </form>
      <button className="ghost" type="button" onClick={() => sb.auth.signOut()}>Odjavi se</button>
    </section>
  );
}
