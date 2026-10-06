"use client";

import { Avatar, avatarOf, useProfile } from "@/components/Avatar";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parisTime } from "@/lib/format";
import { LANGS } from "@/lib/i18n";
import { useSession } from "@/components/useSession";
import { useLang } from "@/components/LangProvider";
import Logo from "@/components/Logo";
import SupportButton from "@/components/Support";

// Language buttons show the flag of the language's country (English → United Kingdom)
const LANG_NAMES = { en: "English", de: "Deutsch", fr: "Français", nl: "Nederlands", es: "Español" };
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
  nl: (
    <svg viewBox="0 0 9 6" aria-hidden="true"><path d="M0 0h9v6H0z" fill="#21468B" /><path d="M0 0h9v4H0z" fill="#fff" /><path d="M0 0h9v2H0z" fill="#AE1C28" /></svg>
  ),
  // Spain: the official flag with the coat of arms, simplified so it stays readable at this size
  es: (
    <svg viewBox="0 0 750 500" aria-hidden="true"><rect width="750" height="500" fill="#AA151B" /><rect y="125" width="750" height="250" fill="#F1BF00" /><g transform="translate(250 250)"><rect x="-98" y="-58" width="22" height="120" fill="#CCCCCC" stroke="#AA151B" strokeWidth="5" /><rect x="76" y="-58" width="22" height="120" fill="#CCCCCC" stroke="#AA151B" strokeWidth="5" /><rect x="-106" y="-72" width="38" height="16" fill="#F1BF00" stroke="#AA151B" strokeWidth="4" /><rect x="68" y="-72" width="38" height="16" fill="#F1BF00" stroke="#AA151B" strokeWidth="4" /><path d="M-58-62h116v66c0 34-26 58-58 58s-58-24-58-58z" fill="#AA151B" stroke="#7A5A00" strokeWidth="5" /><path d="M0-62h58v62H0z" fill="#EEEEEE" /><path d="M-58 0H0v62c-32 0-58-24-58-58z" fill="#F1BF00" /><path d="M-50 0v36M-38 0v48M-26 0v55M-14 0v60" stroke="#AA151B" strokeWidth="7" /><path d="M0 0h58v4c0 34-26 58-58 58z" fill="#AA151B" /><rect x="-40" y="-50" width="22" height="26" fill="#F1BF00" /><circle cx="29" cy="-31" r="13" fill="#AA151B" /><ellipse cx="0" cy="-4" rx="16" ry="20" fill="#2A3E9A" stroke="#AA151B" strokeWidth="4" /><path d="M-52-74l10-30 20 16 22-26 22 26 20-16 10 30z" fill="#C8102E" stroke="#8A6A00" strokeWidth="6" /><path d="M-52-74h104v10h-104z" fill="#D9A400" /></g></svg>
  ),
};

export default function Header() {
  const [time, setTime] = useState("--:--");
  const { session, ready } = useSession();
  const { profile } = useProfile(session);
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
          <Logo size={44} />
          <div>
            <h1>Train Punctuality</h1>
            <p>{t("tagline")}</p>
          </div>
        </Link>
        <div className="top-right">
          <SupportButton className="supportbtn top" />
          {ready && (
            <Link href="/prijava" className={`userlink${session ? " withav" : ""}`}>
              {session && <Avatar src={avatarOf(profile)} name={profile?.display_name || ""} size={26} />}
              {session ? t("myAccount") : t("signIn")}
            </Link>
          )}
          <div className="lang" role="group" aria-label="Language / Sprache / Langue / Taal">
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
