// Train pages for search engines: one lasting page per train number (/train/fr/tgv-inoui-8702).
// The page text is in the language people in that country search in ("retard TGV 8702", "ICE 597 Verspätung").

export const typeSlug = (type) => String(type || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const trainSlug = (type, number) => `${typeSlug(type)}-${number}`;
export const trainPageHref = (country, type, number) => `/train/${country}/${trainSlug(type, number)}`;

// "tgv-inoui-8702" -> { type: "tgv-inoui", number: "8702" }
export function parseTrainSlug(slug) {
  const m = /^([a-z0-9-]+?)-(\d{1,6})$/.exec(String(slug || ""));
  return m ? { type: m[1], number: m[2] } : null;
}

export const COUNTRIES = ["fr", "ch", "be", "nl", "lu", "de", "at", "es", "pt"];
export const PAGE_LANG = { fr: "fr", ch: "de", be: "nl", nl: "nl", lu: "fr", de: "de", at: "de", es: "es", pt: "pt" };
export const COUNTRY_NAME = {
  en: { fr: "France", ch: "Switzerland", be: "Belgium", nl: "the Netherlands", lu: "Luxembourg", de: "Germany", at: "Austria", es: "Spain", pt: "Portugal" },
  fr: { fr: "France", ch: "Suisse", be: "Belgique", nl: "Pays-Bas", lu: "Luxembourg", de: "Allemagne", at: "Autriche", es: "Espagne", pt: "Portugal" },
  de: { fr: "Frankreich", ch: "Schweiz", be: "Belgien", nl: "Niederlande", lu: "Luxemburg", de: "Deutschland", at: "Österreich", es: "Spanien", pt: "Portugal" },
  nl: { fr: "Frankrijk", ch: "Zwitserland", be: "België", nl: "Nederland", lu: "Luxemburg", de: "Duitsland", at: "Oostenrijk", es: "Spanje", pt: "Portugal" },
  es: { fr: "Francia", ch: "Suiza", be: "Bélgica", nl: "Países Bajos", lu: "Luxemburgo", de: "Alemania", at: "Austria", es: "España", pt: "Portugal" },
  pt: { fr: "França", ch: "Suíça", be: "Bélgica", nl: "Países Baixos", lu: "Luxemburgo", de: "Alemanha", at: "Áustria", es: "Espanha", pt: "Portugal" },
};

// Texts of the train page. {n} = train ("TGV INOUI 8702"), {r} = route ("Quimper – Paris")
export const TP = {
  en: {
    kw: "delay today",
    trainPage: "This train on other days: punctuality and timetable →",
    title: "{n} {r}: delay today and punctuality",
    desc: "Is {n} ({r}) late today? Live delay, stops and timetable, and how punctual it was over the last 7 days.",
    today: "Today", live: "Live delay, map and passenger reports →", notToday: "This train does not run today.", loading: "Loading today's status…",
    notStarted: "Not departed yet – departs at {t}.", sched: "Timetable only (no live data for this train).",
    week: "Last 7 days", runs: "Runs with live data", onTime: "On time (up to 5 min)", late15: "15 min or more late", cancelled: "Cancelled", avg: "Average delay", max: "Biggest delay",
    weekNone: "No live data from the last 7 days yet.", weekPaid: "Day-by-day delays and passenger reports of earlier days are a paid extra (from €1).", weekPaidLink: "See the options",
    map: "Route on the map", stops: "Stops and timetable", station: "Station", time: "Time", source: "Timetable and live data: {s}. Updated every few minutes.",
    about: "{n} runs from {o} to {d}, departing at {dep} and arriving at {arr}, with {k} stops.",
  },
  fr: {
    kw: "retard aujourd'hui",
    trainPage: "Ce train les autres jours : ponctualité et horaires →",
    title: "{n} {r} : retard aujourd'hui et ponctualité",
    desc: "Le {n} ({r}) est-il en retard aujourd'hui ? Retard en direct, arrêts, horaires et ponctualité des 7 derniers jours.",
    today: "Aujourd'hui", live: "Retard en direct, carte et avis des voyageurs →", notToday: "Ce train ne circule pas aujourd'hui.", loading: "Chargement de l'état du jour…",
    notStarted: "Pas encore parti – départ à {t}.", sched: "Horaire seulement (pas de données en direct pour ce train).",
    week: "7 derniers jours", runs: "Trajets avec données en direct", onTime: "À l'heure (jusqu'à 5 min)", late15: "15 min de retard ou plus", cancelled: "Supprimés", avg: "Retard moyen", max: "Plus gros retard",
    weekNone: "Pas encore de données en direct pour les 7 derniers jours.", weekPaid: "Le détail jour par jour et les avis des jours précédents sont une option payante (dès 1 €).", weekPaidLink: "Voir les options",
    map: "Le trajet sur la carte", stops: "Arrêts et horaires", station: "Gare", time: "Heure", source: "Horaires et données en direct : {s}. Mis à jour toutes les quelques minutes.",
    about: "Le {n} relie {o} à {d}, départ à {dep}, arrivée à {arr}, avec {k} arrêts.",
  },
  de: {
    kw: "Verspätung heute",
    trainPage: "Dieser Zug an anderen Tagen: Pünktlichkeit und Fahrplan →",
    title: "{n} {r}: Verspätung heute und Pünktlichkeit",
    desc: "Hat {n} ({r}) heute Verspätung? Live-Verspätung, Halte, Fahrplan und Pünktlichkeit der letzten 7 Tage.",
    today: "Heute", live: "Live-Verspätung, Karte und Berichte von Reisenden →", notToday: "Dieser Zug fährt heute nicht.", loading: "Heutiger Stand wird geladen…",
    notStarted: "Noch nicht abgefahren – Abfahrt um {t}.", sched: "Nur Fahrplan (für diesen Zug keine Live-Daten).",
    week: "Letzte 7 Tage", runs: "Fahrten mit Live-Daten", onTime: "Pünktlich (bis 5 Min.)", late15: "15 Min. oder mehr verspätet", cancelled: "Ausgefallen", avg: "Durchschnittliche Verspätung", max: "Grösste Verspätung",
    weekNone: "Noch keine Live-Daten der letzten 7 Tage.", weekPaid: "Verspätungen Tag für Tag und Berichte früherer Tage sind ein kostenpflichtiges Extra (ab 1 €).", weekPaidLink: "Optionen ansehen",
    map: "Strecke auf der Karte", stops: "Halte und Fahrplan", station: "Bahnhof", time: "Zeit", source: "Fahrplan und Live-Daten: {s}. Alle paar Minuten aktualisiert.",
    about: "{n} fährt von {o} nach {d}, ab {dep}, an {arr}, mit {k} Halten.",
  },
  nl: {
    kw: "vertraging vandaag",
    trainPage: "Deze trein op andere dagen: stiptheid en dienstregeling →",
    title: "{n} {r}: vertraging vandaag en stiptheid",
    desc: "Heeft {n} ({r}) vandaag vertraging? Live vertraging, haltes, dienstregeling en stiptheid van de laatste 7 dagen.",
    today: "Vandaag", live: "Live vertraging, kaart en meldingen van reizigers →", notToday: "Deze trein rijdt vandaag niet.", loading: "Stand van vandaag laden…",
    notStarted: "Nog niet vertrokken – vertrek om {t}.", sched: "Alleen dienstregeling (geen live gegevens voor deze trein).",
    week: "Laatste 7 dagen", runs: "Ritten met live gegevens", onTime: "Op tijd (tot 5 min)", late15: "15 min of meer vertraagd", cancelled: "Uitgevallen", avg: "Gemiddelde vertraging", max: "Grootste vertraging",
    weekNone: "Nog geen live gegevens van de laatste 7 dagen.", weekPaid: "Vertragingen per dag en meldingen van eerdere dagen zijn een betaalde extra (vanaf €1).", weekPaidLink: "Bekijk de opties",
    map: "Route op de kaart", stops: "Haltes en dienstregeling", station: "Station", time: "Tijd", source: "Dienstregeling en live gegevens: {s}. Om de paar minuten bijgewerkt.",
    about: "{n} rijdt van {o} naar {d}, vertrek {dep}, aankomst {arr}, met {k} haltes.",
  },
  es: {
    kw: "retraso hoy",
    trainPage: "Este tren otros días: puntualidad y horario →",
    title: "{n} {r}: retraso hoy y puntualidad",
    desc: "¿Llega tarde el {n} ({r}) hoy? Retraso en directo, paradas, horario y puntualidad de los últimos 7 días.",
    today: "Hoy", live: "Retraso en directo, mapa y avisos de viajeros →", notToday: "Este tren no circula hoy.", loading: "Cargando el estado de hoy…",
    notStarted: "Aún no ha salido – sale a las {t}.", sched: "Solo horario (sin datos en directo para este tren).",
    week: "Últimos 7 días", runs: "Viajes con datos en directo", onTime: "Puntual (hasta 5 min)", late15: "15 min o más de retraso", cancelled: "Cancelados", avg: "Retraso medio", max: "Mayor retraso",
    weekNone: "Aún no hay datos en directo de los últimos 7 días.", weekPaid: "El detalle día a día y los avisos de días anteriores son un extra de pago (desde 1 €).", weekPaidLink: "Ver las opciones",
    map: "El recorrido en el mapa", stops: "Paradas y horario", station: "Estación", time: "Hora", source: "Horario y datos en directo: {s}. Actualizado cada pocos minutos.",
    about: "El {n} va de {o} a {d}, sale a las {dep} y llega a las {arr}, con {k} paradas.",
  },
  pt: {
    kw: "atraso hoje",
    trainPage: "Este comboio noutros dias: pontualidade e horário →",
    title: "{n} {r}: atraso hoje e pontualidade",
    desc: "O {n} ({r}) está atrasado hoje? Paragens, horário e pontualidade dos últimos 7 dias.",
    today: "Hoje", live: "Estado, mapa e comentários de passageiros →", notToday: "Este comboio não circula hoje.", loading: "A carregar o estado de hoje…",
    notStarted: "Ainda não partiu – parte às {t}.", sched: "Apenas horário (a CP não publica dados em tempo real).",
    week: "Últimos 7 dias", runs: "Viagens com dados em tempo real", onTime: "Pontual (até 5 min)", late15: "15 min ou mais de atraso", cancelled: "Suprimidos", avg: "Atraso médio", max: "Maior atraso",
    weekNone: "Sem dados em tempo real dos últimos 7 dias.", weekPaid: "O detalhe dia a dia dos dias anteriores é um extra pago (desde 1 €).", weekPaidLink: "Ver as opções",
    map: "O percurso no mapa", stops: "Paragens e horário", station: "Estação", time: "Hora", source: "Horário: {s}.",
    about: "O {n} liga {o} a {d}, parte às {dep} e chega às {arr}, com {k} paragens.",
  },
};

export const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));
// "Paris Montparnasse Hall 1 - 2" -> "Paris Montparnasse" for titles
export const shortName = (s) => String(s || "").replace(/\s+Hall\s.*$/i, "").replace(/\s*\(.*\)$/, "").trim();
