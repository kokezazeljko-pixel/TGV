// Pomoćne funkcije za prikaz (vreme, status kašnjenja)

export const TZ = "Europe/Paris";

export const REASONS = [
  "Kvar na vozu",
  "Signalizacija",
  "Radovi na pruzi",
  "Vremenski uslovi",
  "Ljudi ili životinje na pruzi",
  "Čekanje drugog voza",
  "Gužva / ukrcavanje",
  "Nepoznato",
];

export const TRAIN_FIELDS = "id,number,type,origin,destination,dep,arr,delay_min,cancelled,stops,rt_updated_at,service_date";

export const TRAIN_TYPES = ["Svi", "TGV INOUI", "OUIGO", "TGV Lyria"];

export function parisDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function parisTime() {
  return new Intl.DateTimeFormat("sr-Latn", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export const toMin = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMin = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function statusOf(t) {
  if (t.cancelled) return { cls: "s-gone", label: "Otkazan", key: "late" };
  const d = t.delay_min || 0;
  if (d < 5) return { cls: "s-ok", label: d > 0 ? `+${d} min` : "Na vreme", key: "ontime" };
  if (d < 15) return { cls: "s-warn", label: `+${d} min`, key: "late" };
  return { cls: "s-bad", label: `+${d} min`, key: "late" };
}

export function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "upravo";
  if (s < 3600) return `pre ${Math.floor(s / 60)} min`;
  if (s < 86400) return `pre ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("sr-Latn");
}

export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const trainHref = (id) => `/voz/${encodeURIComponent(id)}`;
