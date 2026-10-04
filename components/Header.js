"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parisTime } from "@/lib/format";
import { LANGS } from "@/lib/i18n";

// Language buttons show the flag of the language's country (English → United Kingdom)
const LANG_NAMES = { en: "English", de: "Deutsch", fr: "Français" };
const FLAGS = {
  en: (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="uk-c"><path d="M0 0v30h60V0z" /></clipPath>
      <clipPath id="uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
      <g clipPath="url(#uk-c)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath="url(#uk-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  ),
  de: (
    <svg viewBox="0 0 5 3" aria-hidden="true"><path d="M0 0h5v3H0z" fill="#000" /><path d="M0 1h5v2H0z" fill="#D00" /><path d="M0 2h5v1H0z" fill="#FFCE00" /></svg>
  ),
  fr: (
    <svg viewBox="0 0 3 2" aria-hidden="true"><path d="M0 0h3v2H0z" fill="#EF4135" /><path d="M0 0h2v2H0z" fill="#fff" /><path d="M0 0h1v2H0z" fill="#0055A4" /></svg>
  ),
};
import { useSession } from "@/components/useSession";
import { useLang } from "@/components/LangProvider";

export default function Header() {
  const [time, setTime] = useState("--:--");
  const { session, ready } = useSession();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const tick = () => setTime(parisTime());
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="brand">
          <div className="logo" aria-hidden="true">TP</div>
          <div>
            <h1>Train Punctuality</h1>
            <p>{t("tagline")}</p>
          </div>
        </Link>
        <div className="top-right">
          {ready && <Link href="/prijava" className="userlink">{session ? t("myAccount") : t("signIn")}</Link>}
          <div className="lang" role="group" aria-label="Language / Sprache / Langue">
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} aria-label={LANG_NAMES[l]} title={LANG_NAMES[l]}>{FLAGS[l]}</button>
            ))}
          </div>
          <div className="clock num"><small>{t("clock")}</small>{time}</div>
        </div>
      </div>
    </header>
  );
}
