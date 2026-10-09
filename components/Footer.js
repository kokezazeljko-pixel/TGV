"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import SupportButton from "@/components/Support";

// Invitation to send feedback, shown above the footer links
const FEEDBACK = {
  en: ["We’d love to hear from you! Opinions, suggestions, criticism or a mistake you spotted – write to us at", "and help us make the site better."],
  de: ["Wir freuen uns auf Ihre Meinung! Vorschläge, Kritik oder ein Fehler, der Ihnen aufgefallen ist – schreiben Sie uns an", "und helfen Sie uns, die Seite zu verbessern."],
  fr: ["Votre avis nous intéresse ! Suggestions, critiques ou une erreur repérée – écrivez-nous à", "et aidez-nous à améliorer le site."],
  nl: ["We horen graag van je! Meningen, suggesties, kritiek of een fout die je zag – mail ons op", "en help ons de site te verbeteren."],
};

export default function Footer() {
  const { t, lang } = useLang();
  const [before, after] = FEEDBACK[lang] || FEEDBACK.en;
  return (
    <footer className="foot">
      <div className="wrap">
        <p style={{ flexBasis: "100%", margin: 0, color: "var(--fg)", lineHeight: 1.5 }}>
          {before} <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a> {after}
        </p>
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
        <span>{t("dataSource")}</span>
        <Link href="/privacy">{t("privacy")}</Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>{t("contact")}</a>
        <SupportButton className="supportbtn foot-link" />
      </div>
    </footer>
  );
}
