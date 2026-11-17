// Station pages for search engines: one lasting page per busy station (/station/de/koln-hbf) with today's trains
// and how punctual trains were there over the last 7 days. Texts in the site languages; the server sends English.
import { typeSlug } from "./trainpage";

// the name without a hall ("Paris Gare de Lyon Hall 1 - 2"), but keeping "(Oder)" in "Frankfurt (Oder)"
export const stationName = (name) => String(name || "").replace(/\s+Hall\s.*$/i, "").trim();
export const stationSlug = (name) => typeSlug(stationName(name));
export const stationPageHref = (country, name) => `/station/${country}/${stationSlug(name)}`;

export const SP = {
  en: { map: "Where the trains come from and go", mapNote: "The lines of today's trains through {s}; the trains running now move on the map. Tap a train to open it.", kw: "train delays today", title: "{s} station: train delays today and punctuality",
    desc: "Trains at {s} today with their live delays, and how punctual trains were at {s} over the last 7 days.",
    sub: "Station · {c} · about {n} trains a day", today: "Trains today", time: "Time", train: "Train", to: "to {x}", from: "from {x}",
    pf: "Pl.", status: "Status", onTimeLbl: "on time", cancelled: "cancelled", sched: "timetable", earlier: "Show earlier trains", more: "Show all {n} trains",
    noneToday: "No trains in our data for today yet.", week: "Last 7 days at this station", runs: "Train stops with live data",
    onTime: "On time (up to 5 min)", late15: "15 min or more late", cancelledW: "Cancelled stops", avg: "Average delay",
    note: "On time = at most 5 minutes late at this station. Delays as of {t}; open a train for its live position.",
    weekPaid: "Day-by-day delays of earlier days are a paid extra (from €1).", weekPaidLink: "See the options", station: "Station page" },
  fr: { map: "D'où viennent et où vont les trains", mapNote: "Les lignes des trains du jour qui passent par {s} ; les trains en circulation bougent sur la carte. Touchez un train pour l'ouvrir.", kw: "retards des trains aujourd'hui", title: "Gare de {s} : retards des trains aujourd'hui et ponctualité",
    desc: "Les trains de {s} aujourd'hui avec leurs retards en direct, et la ponctualité des trains à {s} sur les 7 derniers jours.",
    sub: "Gare · {c} · environ {n} trains par jour", today: "Trains aujourd'hui", time: "Heure", train: "Train", to: "vers {x}", from: "de {x}",
    pf: "Voie", status: "État", onTimeLbl: "à l'heure", cancelled: "supprimé", sched: "horaire", earlier: "Afficher les trains précédents", more: "Afficher les {n} trains",
    noneToday: "Pas encore de trains pour aujourd'hui dans nos données.", week: "7 derniers jours dans cette gare", runs: "Arrêts avec données en direct",
    onTime: "À l'heure (jusqu'à 5 min)", late15: "15 min de retard ou plus", cancelledW: "Arrêts supprimés", avg: "Retard moyen",
    note: "À l'heure = au plus 5 minutes de retard dans cette gare. Retards à {t} ; ouvrez un train pour sa position en direct.",
    weekPaid: "Le détail jour par jour des jours précédents est une option payante (dès 1 €).", weekPaidLink: "Voir les options", station: "Page de la gare" },
  de: { map: "Woher die Züge kommen und wohin sie fahren", mapNote: "Die Strecken der heutigen Züge über {s}; Züge, die gerade fahren, bewegen sich auf der Karte. Tippen Sie auf einen Zug, um ihn zu öffnen.", kw: "Verspätungen heute", title: "Bahnhof {s}: Zugverspätungen heute und Pünktlichkeit",
    desc: "Die Züge in {s} heute mit ihren Live-Verspätungen, und wie pünktlich die Züge in {s} in den letzten 7 Tagen waren.",
    sub: "Bahnhof · {c} · etwa {n} Züge am Tag", today: "Züge heute", time: "Zeit", train: "Zug", to: "nach {x}", from: "von {x}",
    pf: "Gl.", status: "Status", onTimeLbl: "pünktlich", cancelled: "fällt aus", sched: "Fahrplan", earlier: "Frühere Züge zeigen", more: "Alle {n} Züge zeigen",
    noneToday: "Für heute noch keine Züge in unseren Daten.", week: "Letzte 7 Tage an diesem Bahnhof", runs: "Halte mit Echtzeitdaten",
    onTime: "Pünktlich (bis 5 Min.)", late15: "15 Min. oder mehr verspätet", cancelledW: "Ausgefallene Halte", avg: "Durchschnittliche Verspätung",
    note: "Pünktlich = höchstens 5 Minuten Verspätung an diesem Bahnhof. Verspätungen von {t}; öffnen Sie einen Zug für seine Live-Position.",
    weekPaid: "Verspätungen Tag für Tag früherer Tage sind ein kostenpflichtiges Extra (ab 1 €).", weekPaidLink: "Optionen ansehen", station: "Bahnhofsseite" },
  nl: { map: "Waar de treinen vandaan komen en heen gaan", mapNote: "De lijnen van de treinen van vandaag via {s}; treinen die nu rijden bewegen op de kaart. Tik op een trein om hem te openen.", kw: "vertragingen vandaag", title: "Station {s}: treinvertragingen vandaag en stiptheid",
    desc: "De treinen in {s} vandaag met hun live vertraging, en hoe stipt de treinen in {s} de laatste 7 dagen waren.",
    sub: "Station · {c} · ongeveer {n} treinen per dag", today: "Treinen vandaag", time: "Tijd", train: "Trein", to: "naar {x}", from: "van {x}",
    pf: "Spoor", status: "Status", onTimeLbl: "op tijd", cancelled: "rijdt niet", sched: "dienstregeling", earlier: "Eerdere treinen tonen", more: "Alle {n} treinen tonen",
    noneToday: "Nog geen treinen voor vandaag in onze gegevens.", week: "Laatste 7 dagen op dit station", runs: "Stops met live gegevens",
    onTime: "Op tijd (tot 5 min)", late15: "15 min of meer vertraagd", cancelledW: "Uitgevallen stops", avg: "Gemiddelde vertraging",
    note: "Op tijd = hoogstens 5 minuten vertraging op dit station. Vertragingen van {t}; open een trein voor zijn live positie.",
    weekPaid: "Vertragingen per dag van eerdere dagen zijn een betaalde extra (vanaf €1).", weekPaidLink: "Bekijk de opties", station: "Stationspagina" },
  es: { map: "De dónde vienen y adónde van los trenes", mapNote: "Las líneas de los trenes de hoy que pasan por {s}; los trenes en marcha se mueven en el mapa. Toca un tren para abrirlo.", kw: "retrasos hoy", title: "Estación de {s}: retrasos de trenes hoy y puntualidad",
    desc: "Los trenes de {s} hoy con su retraso en directo, y la puntualidad de los trenes en {s} en los últimos 7 días.",
    sub: "Estación · {c} · unos {n} trenes al día", today: "Trenes hoy", time: "Hora", train: "Tren", to: "a {x}", from: "de {x}",
    pf: "Vía", status: "Estado", onTimeLbl: "puntual", cancelled: "cancelado", sched: "horario", earlier: "Ver trenes anteriores", more: "Ver los {n} trenes",
    noneToday: "Aún no hay trenes de hoy en nuestros datos.", week: "Últimos 7 días en esta estación", runs: "Paradas con datos en directo",
    onTime: "Puntual (hasta 5 min)", late15: "15 min o más de retraso", cancelledW: "Paradas canceladas", avg: "Retraso medio",
    note: "Puntual = como mucho 5 minutos de retraso en esta estación. Retrasos de las {t}; abre un tren para ver su posición en directo.",
    weekPaid: "El detalle día a día de días anteriores es un extra de pago (desde 1 €).", weekPaidLink: "Ver las opciones", station: "Página de la estación" },
};
SP.pt = { ...SP.es, kw: "atrasos hoje" }; // Portugal: Spanish page texts until the site has Portuguese
