// Display helpers (time, delay status). Texts come from lib/i18n.js via t().

import { LOCALES } from "./i18n";

export const TZ = "Europe/Paris";

export const TRAIN_FIELDS = "id,number,type,origin,destination,dep,arr,delay_min,cancelled,stops,rt_updated_at,service_date,country";

// Shuttles such as Avignon Centre ↔ Avignon TGV have 6-digit numbers; they are not real TGVs
export const isShuttle = (tr) => /^\d{6,}$/.test(tr.number || "");

export function parisDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Minutes since midnight in Paris, with seconds as a fraction (for smooth train movement)
export function parisNowMin() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return +p.hour * 60 + +p.minute + +p.second / 60;
}

export const parisTime = () => fromMin(Math.floor(parisNowMin()));

export const toMin = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMin = (m) => {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function statusOf(tr, t) {
  if (tr.cancelled) return { cls: "s-gone", label: t("cancelled"), key: "late", dot: null };
  const d = tr.delay_min || 0;
  if (d < 5) return { cls: "s-ok", label: d > 0 ? `+${d} min` : t("onTimeLbl"), key: "ontime", dot: "s-ok" };
  if (d < 15) return { cls: "s-warn", label: `+${d} min`, key: "late", dot: "s-warn" };
  return { cls: "s-bad", label: `+${d} min`, key: "late", dot: "s-bad" };
}

export function ago(iso, t, lang) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("justNow");
  if (s < 3600) return t("minAgo", Math.floor(s / 60));
  if (s < 86400) return t("hAgo", Math.floor(s / 3600));
  return new Date(iso).toLocaleDateString(LOCALES[lang] || "en-GB");
}

export const trainHref = (id) => `/voz/${encodeURIComponent(id)}`;

export function filterTrains(trains, { type, status, q }, t) {
  const query = (q || "").trim().toLowerCase();
  return trains
    .filter((x) => !isShuttle(x))
    .filter((x) => type === "all" || x.type === type)
    .filter((x) => status === "all" || statusOf(x, t).key === status)
    .filter((x) => !query || [x.number, x.origin, x.destination, ...(x.stops || []).map((s) => s.name)].join(" ").toLowerCase().includes(query));
}
