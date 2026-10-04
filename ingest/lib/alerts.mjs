// Official notices (GTFS-RT Service Alerts) -> rows for apply_alerts. Used by the Supabase Edge function.
import { BE_ALERTS_URL } from "./belgium.mjs";
export const ALERT_FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts", headers: () => ({}), langs: ["fr", "en"] },
  // the Swiss notices have their own API token (SWISS_SA_API_KEY); the delays token is used if it is missing
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-sa", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }), langs: ["de", "fr", "it", "en"] },
  // SNCB: JSON, linked to the network only -> matched to trains by the station names (belgianAlertRows)
  be: { url: BE_ALERTS_URL, headers: () => ({ Accept: "application/json" }), langs: ["fr", "nl", "de", "en"], json: true },
};

const lang2 = (l) => (l || "").toLowerCase().slice(0, 2);
// all languages the railway published: { fr: "...", en: "..." }
const allLangs = (tr) => { const o = {}; for (const t of tr || []) if (t.text && lang2(t.lang) && !o[lang2(t.lang)]) o[lang2(t.lang)] = t.text; return o; };
// the official (original) language: French for SNCF; for Switzerland the language the notice was written in first
const origLang = (tr, country) => {
  const langs = (tr || []).map((t) => lang2(t.lang)).filter(Boolean);
  if (country === "fr") return langs.includes("fr") ? "fr" : langs[0] || "fr";
  return langs.find((l) => ["de", "fr", "it"].includes(l)) || langs[0] || "de";
};

// pick the text in the preferred language (first one that exists)
const pick = (tr, langs) => {
  if (!tr?.length) return null;
  for (const l of langs) { const x = tr.find((t) => (t.lang || "").toLowerCase().startsWith(l)); if (x?.text) return x.text; }
  return tr[0].text || null;
};

export function alertRows(feed, country, nowSec) {
  const langs = ALERT_FEEDS[country].langs;
  const rows = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a || e.isDeleted) continue;
    // still relevant now or later today
    const periods = a.activePeriods.length ? a.activePeriods : [{}];
    const live = periods.some((p) => (p.end == null || p.end === 0 || p.end > nowSec) && (p.start == null || p.start < nowSec + 36 * 3600));
    if (!live) continue;
    const trip_ids = [...new Set(a.informed.map((i) => i.trip?.tripId).filter(Boolean))];
    if (!trip_ids.length) continue;
    const p = periods.find((x) => x.start || x.end) || {};
    const orig = origLang(a.description?.length ? a.description : a.header, country);
    rows.push({
      id: e.id,
      orig_lang: orig,
      header_tr: allLangs(a.header),
      description_tr: allLangs(a.description),
      header: pick(a.header, [orig, ...langs]),
      description: pick(a.description, [orig, ...langs]),
      cause: a.cause ?? null,
      effect: a.effect ?? null,
      url: pick(a.url, langs),
      active_from: p.start ? new Date(p.start * 1000).toISOString() : null,
      active_to: p.end ? new Date(p.end * 1000).toISOString() : null,
      trip_ids,
    });
  }
  return rows;
}

// numbers for the log: how the feed links alerts to trips / routes / stops
export function alertStats(feed) {
  const s = { alerts: 0, withTrip: 0, withRoute: 0, withStop: 0 };
  for (const e of feed.entities) {
    if (!e.alert) continue;
    s.alerts++;
    if (e.alert.informed.some((i) => i.trip?.tripId)) s.withTrip++;
    if (e.alert.informed.some((i) => i.routeId)) s.withRoute++;
    if (e.alert.informed.some((i) => i.stopId)) s.withStop++;
  }
  return s;
}
