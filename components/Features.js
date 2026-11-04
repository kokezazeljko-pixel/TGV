"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "@/components/LangProvider";

// "What you can do here": a short row of cards on the main page, so visitors find the options
// (passenger reports, records, sharing a train, earlier days). It can be closed; the choice is remembered.
const TX = {
  en: { title: "What you can do here", hide: "Hide",
    items: [["🗺️", "Live map", "Every train on the map, with its delay right now"], ["💬", "Passenger reports", "On board? Tell others why it's late and how full it is"], ["🏆", "Records of the week", "The most punctual countries, routes and stations", "/rekordi"], ["🔗", "Share a train", "Open a train and share its punctuality card"], ["📅", "Earlier days", "Delays of the last 7 days, from €1"]] },
  de: { title: "Was Sie hier tun können", hide: "Ausblenden",
    items: [["🗺️", "Live-Karte", "Jeder Zug auf der Karte, mit seiner aktuellen Verspätung"], ["💬", "Berichte von Reisenden", "An Bord? Erzählen Sie, warum es Verspätung gibt und wie voll es ist"], ["🏆", "Rekorde der Woche", "Die pünktlichsten Länder, Strecken und Bahnhöfe", "/rekordi"], ["🔗", "Zug teilen", "Öffnen Sie einen Zug und teilen Sie seine Pünktlichkeitskarte"], ["📅", "Frühere Tage", "Verspätungen der letzten 7 Tage, ab 1 €"]] },
  fr: { title: "Ce que vous pouvez faire ici", hide: "Masquer",
    items: [["🗺️", "Carte en direct", "Chaque train sur la carte, avec son retard actuel"], ["💬", "Avis des voyageurs", "À bord ? Dites pourquoi il est en retard et s'il est plein"], ["🏆", "Records de la semaine", "Les pays, lignes et gares les plus ponctuels", "/rekordi"], ["🔗", "Partager un train", "Ouvrez un train et partagez sa carte de ponctualité"], ["📅", "Jours précédents", "Les retards des 7 derniers jours, dès 1 €"]] },
  nl: { title: "Wat je hier kunt doen", hide: "Verbergen",
    items: [["🗺️", "Live kaart", "Elke trein op de kaart, met zijn vertraging van nu"], ["💬", "Meldingen van reizigers", "Aan boord? Vertel waarom hij vertraagd is en hoe vol het is"], ["🏆", "Records van de week", "De stiptste landen, trajecten en stations", "/rekordi"], ["🔗", "Deel een trein", "Open een trein en deel zijn stiptheidskaart"], ["📅", "Eerdere dagen", "Vertragingen van de laatste 7 dagen, vanaf €1"]] },
  es: { title: "Qué puedes hacer aquí", hide: "Ocultar",
    items: [["🗺️", "Mapa en directo", "Cada tren en el mapa, con su retraso actual"], ["💬", "Avisos de viajeros", "¿A bordo? Cuenta por qué va con retraso y si va lleno"], ["🏆", "Récords de la semana", "Los países, rutas y estaciones más puntuales", "/rekordi"], ["🔗", "Compartir un tren", "Abre un tren y comparte su tarjeta de puntualidad"], ["📅", "Días anteriores", "Los retrasos de los últimos 7 días, desde 1 €"]] },
};
const KEY = "tp-features-hidden";

export default function Features() {
  const { lang } = useLang();
  const L = TX[lang] || TX.en;
  const [hidden, setHidden] = useState(true); // shown only after the browser says it was not closed before
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { setHidden(false); } }, []);
  if (hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, "1"); } catch {} };

  return (
    <section className="features" aria-labelledby="features-title">
      <div className="features-head">
        <h3 id="features-title">{L.title}</h3>
        <button type="button" className="features-x" onClick={hide} aria-label={L.hide} title={L.hide}>×</button>
      </div>
      <ul className="features-list">
        {L.items.map(([ico, title, text, href]) => {
          const body = <><span className="f-ico" aria-hidden="true">{ico}</span><span className="f-txt"><b>{title}</b><small>{text}</small></span></>;
          return <li key={title}>{href ? <Link href={href} className="f-card link">{body}</Link> : <div className="f-card">{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}
