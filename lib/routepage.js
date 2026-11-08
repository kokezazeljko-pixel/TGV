// Route pages for search engines: one lasting page per origin → destination of our trains
// (/route/fr/paris-gare-de-lyon--lyon-perrache). Texts in the site languages; the server sends English.
import { typeSlug, shortName } from "./trainpage";

export const placeSlug = (name) => typeSlug(shortName(name));
export const routeSlug = (origin, destination) => `${placeSlug(origin)}--${placeSlug(destination)}`;
export const routePageHref = (country, origin, destination) => `/route/${country}/${routeSlug(origin, destination)}`;

export const RP = {
  en: { all: "All trains {o} → {d}", kw: "train delays", title: "{o} – {d} trains: timetable, delays today and punctuality",
    desc: "All trains from {o} to {d}: timetable, live delays and how punctual each train was over the last 7 days.",
    sub: "{n} trains on this route", week: "Last 7 days on this route", runs: "Trains with live data", onTime: "On time (up to 5 min)", late15: "15 min or more late", cancelled: "Cancelled", avg: "Average delay",
    trains: "Trains", dep: "Departs", arr: "Arrives", train: "Train", punct: "On time, 7 days", avgShort: "Avg. delay", none: "no live data",
    back: "Return trip", note: "On time = at most 5 minutes late at the last stop. Open a train for its live delay today.", weekPaid: "Day-by-day delays of earlier days are a paid extra (from €1).", weekPaidLink: "See the options", noteAt: "On time = at most 5 minutes late on arrival in {d}. Open a train for its live delay today." },
  fr: { all: "Tous les trains {o} → {d}", kw: "train horaires et retards", title: "Trains {o} – {d} : retards aujourd'hui et ponctualité",
    desc: "Tous les trains de {o} à {d} : horaires, retards en direct et ponctualité de chaque train sur les 7 derniers jours.",
    sub: "{n} trains sur ce trajet", week: "7 derniers jours sur ce trajet", runs: "Trains avec données en direct", onTime: "À l'heure (jusqu'à 5 min)", late15: "15 min de retard ou plus", cancelled: "Supprimés", avg: "Retard moyen",
    trains: "Trains", dep: "Départ", arr: "Arrivée", train: "Train", punct: "À l'heure, 7 jours", avgShort: "Retard moyen", none: "pas de données",
    back: "Trajet retour", note: "À l'heure = au plus 5 minutes de retard au dernier arrêt. Ouvrez un train pour son retard du jour.", weekPaid: "Le détail jour par jour des jours précédents est une option payante (dès 1 €).", weekPaidLink: "Voir les options", noteAt: "À l'heure = au plus 5 minutes de retard à l'arrivée à {d}. Ouvrez un train pour son retard du jour." },
  de: { all: "Alle Züge {o} → {d}", kw: "Zug Fahrplan und Verspätung", title: "Züge {o} – {d}: Verspätung heute und Pünktlichkeit",
    desc: "Alle Züge von {o} nach {d}: Fahrplan, Live-Verspätungen und die Pünktlichkeit jedes Zuges in den letzten 7 Tagen.",
    sub: "{n} Züge auf dieser Strecke", week: "Letzte 7 Tage auf dieser Strecke", runs: "Züge mit Echtzeitdaten", onTime: "Pünktlich (bis 5 Min.)", late15: "15 Min. oder mehr verspätet", cancelled: "Ausgefallen", avg: "Durchschnittliche Verspätung",
    trains: "Züge", dep: "Ab", arr: "An", train: "Zug", punct: "Pünktlich, 7 Tage", avgShort: "Ø Verspätung", none: "keine Daten",
    back: "Rückfahrt", note: "Pünktlich = höchstens 5 Minuten Verspätung am letzten Halt. Öffnen Sie einen Zug für seine heutige Verspätung.", weekPaid: "Verspätungen Tag für Tag früherer Tage sind ein kostenpflichtiges Extra (ab 1 €).", weekPaidLink: "Optionen ansehen", noteAt: "Pünktlich = höchstens 5 Minuten Verspätung bei der Ankunft in {d}. Öffnen Sie einen Zug für seine heutige Verspätung." },
  nl: { all: "Alle treinen {o} → {d}", kw: "trein dienstregeling en vertraging", title: "Treinen {o} – {d}: vertraging vandaag en stiptheid",
    desc: "Alle treinen van {o} naar {d}: dienstregeling, live vertragingen en hoe stipt elke trein de laatste 7 dagen was.",
    sub: "{n} treinen op dit traject", week: "Laatste 7 dagen op dit traject", runs: "Treinen met live gegevens", onTime: "Op tijd (tot 5 min)", late15: "15 min of meer vertraagd", cancelled: "Uitgevallen", avg: "Gemiddelde vertraging",
    trains: "Treinen", dep: "Vertrek", arr: "Aankomst", train: "Trein", punct: "Op tijd, 7 dagen", avgShort: "Gem. vertraging", none: "geen gegevens",
    back: "Terugreis", note: "Op tijd = hoogstens 5 minuten vertraging bij de laatste halte. Open een trein voor zijn vertraging van vandaag.", weekPaid: "Vertragingen per dag van eerdere dagen zijn een betaalde extra (vanaf €1).", weekPaidLink: "Bekijk de opties", noteAt: "Op tijd = hoogstens 5 minuten vertraging bij aankomst in {d}. Open een trein voor zijn vertraging van vandaag." },
  es: { all: "Todos los trenes {o} → {d}", kw: "tren horarios y retrasos", title: "Trenes {o} – {d}: retrasos hoy y puntualidad",
    desc: "Todos los trenes de {o} a {d}: horario, retrasos en directo y la puntualidad de cada tren en los últimos 7 días.",
    sub: "{n} trenes en esta ruta", week: "Últimos 7 días en esta ruta", runs: "Trenes con datos en directo", onTime: "Puntual (hasta 5 min)", late15: "15 min o más de retraso", cancelled: "Cancelados", avg: "Retraso medio",
    trains: "Trenes", dep: "Salida", arr: "Llegada", train: "Tren", punct: "Puntual, 7 días", avgShort: "Retraso medio", none: "sin datos",
    back: "Viaje de vuelta", note: "Puntual = como mucho 5 minutos de retraso en la última parada. Abre un tren para ver su retraso de hoy.", weekPaid: "El detalle día a día de días anteriores es un extra de pago (desde 1 €).", weekPaidLink: "Ver las opciones", noteAt: "Puntual = como mucho 5 minutos de retraso a la llegada a {d}. Abre un tren para ver su retraso de hoy." },
};
RP.pt = { ...RP.es, kw: "comboio horários e atrasos" }; // Portugal: Spanish page texts until the site has Portuguese
