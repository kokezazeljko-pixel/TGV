"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parisTime } from "@/lib/format";
import { LANGS } from "@/lib/i18n";
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
          <div className="lang" role="group" aria-label="Language / Langue">
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <div className="clock num"><small>{t("clock")}</small>{time}</div>
        </div>
      </div>
    </header>
  );
}
