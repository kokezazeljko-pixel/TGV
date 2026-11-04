"use client";

import { useState } from "react";
import { useLang } from "@/components/LangProvider";
import { SITE_URL } from "@/lib/site";
import { trainPageHref } from "@/lib/trainpage";

// A glowing "Share this train" button: shares the train's lasting page (/train/…), whose link shows the
// punctuality picture (opengraph-image) in WhatsApp, LinkedIn, X… On phones the system share sheet opens,
// elsewhere the link is copied.
const TX = {
  en: { btn: "Share this train", hint: "with its punctuality card", copied: "Link copied ✓", text: (n) => `How punctual is ${n}? Live delay and the last 7 days:` },
  de: { btn: "Diesen Zug teilen", hint: "mit Pünktlichkeitskarte", copied: "Link kopiert ✓", text: (n) => `Wie pünktlich ist ${n}? Live-Verspätung und die letzten 7 Tage:` },
  fr: { btn: "Partager ce train", hint: "avec sa carte de ponctualité", copied: "Lien copié ✓", text: (n) => `Le ${n} est-il ponctuel ? Retard en direct et les 7 derniers jours :` },
  nl: { btn: "Deel deze trein", hint: "met stiptheidskaart", copied: "Link gekopieerd ✓", text: (n) => `Hoe stipt is ${n}? Live vertraging en de laatste 7 dagen:` },
  es: { btn: "Compartir este tren", hint: "con su tarjeta de puntualidad", copied: "Enlace copiado ✓", text: (n) => `¿Es puntual el ${n}? Retraso en directo y los últimos 7 días:` },
};

export default function ShareTrain({ country, type, number }) {
  const { lang } = useLang();
  const L = TX[lang] || TX.en;
  const [copied, setCopied] = useState(false);
  if (!/^\d+$/.test(String(number || ""))) return null;
  const url = SITE_URL + trainPageHref(country || "fr", type, number);
  const name = `${type} ${number}`;

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: name, text: L.text(name), url }); return; }
    } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button type="button" className="sharetrain" onClick={share} aria-label={`${L.btn} – ${L.hint}`}>
      <span className="st-ico" aria-hidden="true">↗</span>
      <span className="st-txt"><b>{copied ? L.copied : L.btn}</b><small>{L.hint}</small></span>
    </button>
  );
}
