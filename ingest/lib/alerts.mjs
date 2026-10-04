// Official notices (GTFS-RT Service Alerts) -> rows for apply_alerts. Used by the Supabase Edge function.
export const ALERT_FEEDS = {
  fr: { url: "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts", headers: () => ({}), langs: ["fr", "en"] },
  ch: { url: "https://api.opentransportdata.swiss/la/gtfs-sa", headers: (key) => ({ Authorization: `Bearer ${key}`, "Accept-Encoding": "br, gzip, deflate" }), langs: ["de", "fr", "it", "en"] },
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
    rows.push({
      id: e.id,
      header: pick(a.header, langs),
      description: pick(a.description, langs),
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
