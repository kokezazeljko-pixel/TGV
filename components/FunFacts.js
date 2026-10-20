"use client";

// "Fun facts" under the map: the first record of each category for the chosen country (or Europe),
// with a link to the page /rekordi that shows the top 5 of everything.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
import { FF_CATS, loadFunFacts, ffDescribe, ffRange, ffShare } from "@/lib/funfacts";

export default function FunFacts({ country, onStation, onRoute }) {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(null);
  useEffect(() => { loadFunFacts().then(setData); }, []);

  if (!data) return null;
  const scope = data.facts[country] ? country : "all";
  const f = data.facts[scope];
  if (!f) return null;
  const loc = LOCALES[lang] || "en-GB";
  const num = (x) => Number(x).toLocaleString(loc);
  const range = ffRange(data, loc);
  const place = t("country_" + scope);
  const many = scope === "all"; // the Europe view: show whose record it is

  const cards = FF_CATS.filter(([cat]) => f[cat]?.length).map(([cat, k, tone]) => {
    const d = ffDescribe(cat, f[cat][0], t, num);
    return { k, tone, ...d, flag: many && d.country, pick: onStation && d.station && (many || d.country === country) ? d.station : null, line: onRoute && d.route && (many || d.country === country) ? d.route : null };
  });
  if (!cards.length) return null;

  const share = async (c) => {
    const ok = await ffShare(t(c.k), `${t(c.k)} (${place}, ${range}): ${c.title} · ${c.sub.join(" · ")}`, `/rekordi${scope === "all" ? "" : "?c=" + scope}`);
    if (ok) { setCopied(c.k); setTimeout(() => setCopied(null), 1800); }
  };

  return (
    <section className="facts" id="facts" aria-labelledby="facts-h">
      <div className="facts-head">
        <h3 id="facts-h">{t("ffTitle")}</h3>
        <span className="muted">{t("ffNote", range)}</span>
        <Link href={`/rekordi${scope === "all" ? "" : "?c=" + scope}`} className="facts-more">{t("ffTop5")} →</Link>
      </div>
      <div className="facts-grid">
        {cards.map((c) => (
          <article key={c.k} className={`fact tone-${c.tone}`}>
            <div className="fact-k">{t(c.k)}</div>
            <div className="fact-v">
              {c.flag && <span className={`flag flag-${c.flag}`} aria-label={t("country_" + c.flag)} />}
              {c.pick
                ? <button type="button" className="fact-link" onClick={() => onStation(c.pick)} title={t("ffShowMap")}>{c.title}</button>
                : c.line
                  ? <button type="button" className="fact-link" onClick={() => onRoute(c.line)} title={t("ffShowMap")}>{c.title}</button>
                  : c.title}
            </div>
            <div className="fact-sub">{c.sub.join(" · ")}</div>
            <button type="button" className="fact-share" onClick={() => share(c)} aria-label={`${t("ffShare")}: ${t(c.k)}`}>
              {copied === c.k ? t("ffCopied") : t("ffShare")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
