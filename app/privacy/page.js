"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { CONTACT_EMAIL, SITE_NAME, PRIVACY_UPDATED } from "@/lib/site";
import { PRIVACY } from "./content";
import { LOCALES } from "@/lib/i18n";

const fill = (s) => s.replaceAll("{site}", SITE_NAME).replaceAll("{email}", CONTACT_EMAIL);

// Puts the contact email in a mailto link wherever it appears in a sentence
function Text({ children }) {
  const parts = fill(children).split(CONTACT_EMAIL);
  return parts.map((p, i) => (
    <span key={i}>{p}{i < parts.length - 1 && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}</span>
  ));
}

export default function PrivacyPage() {
  const { lang, t } = useLang();
  const c = PRIVACY[lang] || PRIVACY.en;
  const date = new Date(PRIVACY_UPDATED + "T12:00:00Z").toLocaleDateString(LOCALES[lang] || "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="legal">
      <Link href="/" className="back">{t("allTrains")}</Link>
      <h2>{c.title}</h2>
      <p className="muted">{c.updated}: {date}</p>
      <p><Text>{c.intro}</Text></p>
      {c.sections.map((s) => (
        <section key={s.h}>
          <h3>{s.h}</h3>
          {s.p?.map((x, i) => <p key={"p" + i}><Text>{x}</Text></p>)}
          {s.list && <ul>{s.list.map((x, i) => <li key={i}><Text>{x}</Text></li>)}</ul>}
          {s.after?.map((x, i) => <p key={"a" + i}><Text>{x}</Text></p>)}
          {s.list2 && <><h4>{s.list2h}</h4><p><Text>{s.list2}</Text></p></>}
        </section>
      ))}
    </article>
  );
}
