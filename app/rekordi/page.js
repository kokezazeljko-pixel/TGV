"use client";

// Records of the last 7 full days: top 5 of every category, for Europe and for each country (?c=de).
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { LOCALES } from "@/lib/i18n";
import { SCHEDULE_ONLY } from "@/lib/format";
import { FF_CATS, loadFunFacts, ffDescribe, ffRange, ffShare } from "@/lib/funfacts";

const COUNTRIES = ["all", "ch", "fr", "de", "at", "es", "pt", "be", "nl", "lu"]; // same order as the main page

export default function RecordsPage() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [country, setCountry] = useState("all");
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c && COUNTRIES.includes(c)) setCountry(c);
    loadFunFacts().then((d) => (d ? setData(d) : setFailed(true)));
  }, []);
  const choose = (c) => {
    setCountry(c);
    try { window.history.replaceState(null, "", c === "all" ? "/rekordi" : `/rekordi?c=${c}`); } catch {}
  };

  const loc = LOCALES[lang] || "en-GB";
  const num = (x) => Number(x).toLocaleString(loc);
  const f = data?.facts?.[country] || {};
  const many = country === "all";
  const place = t("country_" + country);
  const range = data ? ffRange(data, loc) : "";
  const lists = FF_CATS.filter(([cat]) => f[cat]?.length).map(([cat, k, tone]) => ({ cat, k, tone, rows: f[cat].map((x) => ffDescribe(cat, x, t, num)) }));

  const share = async (l) => {
    const text = `${t(l.k)} (${place}, ${range}):\n` + l.rows.map((r, i) => `${i + 1}. ${r.title} · ${r.sub[r.sub.length > 1 && l.cat === "train_worst" ? 1 : 0]}`).join("\n");
    const ok = await ffShare(t(l.k), text, country === "all" ? "/rekordi" : `/rekordi?c=${country}`);
    if (ok) { setCopied(l.k); setTimeout(() => setCopied(null), 1800); }
  };

  return (
    <article className="records">
      <Link href="/" className="back">{t("allTrains")}</Link>
      <h2>{t("ffPageTitle")}</h2>
      <p className="muted">{data ? t("ffNote", range) : failed ? t("loadError") : t("loading")}</p>

      <div className="countries" role="group" aria-label={t("countryGroup")}>
        {COUNTRIES.map((c) => (
          <button key={c} type="button" className="countrybtn" aria-pressed={country === c} onClick={() => choose(c)}>
            <span className={`flag flag-${c === "all" ? "eu" : c}`} aria-hidden="true" />{t("country_" + c)}
          </button>
        ))}
      </div>

      {data && SCHEDULE_ONLY.has(country) && <p className="notice">{t("ffSchedOnly", place)}</p>}
      {data && !lists.length && <p className="notice">{t("ffNone")}</p>}

      <div className="rec-grid">
        {lists.map((l) => (
          <section key={l.cat} className={`rec tone-${l.tone}`} aria-labelledby={`rec-${l.cat}`}>
            <div className="rec-head">
              <h3 id={`rec-${l.cat}`}>{t(l.k)}</h3>
              <button type="button" className="fact-share" onClick={() => share(l)} aria-label={`${t("ffShare")}: ${t(l.k)}`}>
                {copied === l.k ? t("ffCopied") : t("ffShare")}
              </button>
            </div>
            <ol className="rec-list">
              {l.rows.map((r, i) => (
                <li key={i}>
                  <span className="rec-n" aria-hidden="true">{i + 1}</span>
                  <div className="rec-body">
                    <div className="rec-v">
                      {many && <span className={`flag flag-${r.country}`} aria-label={t("country_" + r.country)} />}
                      {r.station
                        ? <Link href={`/?c=${r.country}&station=${encodeURIComponent(r.station)}`} title={t("ffShowMap")}>{r.title}</Link>
                        : r.route
                          ? <Link href={`/?c=${r.country}&route=${encodeURIComponent(r.route.a + "~" + r.route.b)}&tone=${r.route.tone}`} title={t("ffShowMap")}>{r.title}</Link>
                          : <span>{r.title}</span>}
                    </div>
                    <div className="fact-sub">{r.sub.join(" · ")}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </article>
  );
}
