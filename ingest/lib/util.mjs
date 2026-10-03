// Pomoćne funkcije: vreme u Parizu, prepoznavanje vrste voza, Supabase REST.

export const TZ = "Europe/Paris";

// Datum u Parizu kao "YYYY-MM-DD", uz pomeraj u danima
export function parisDate(offsetDays = 0, now = new Date()) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Razlika između pariskog i UTC vremena u minutima za dati trenutak
function tzOffsetMin(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

// "2026-10-03" + "25:10:00" (GTFS dozvoljava sate preko 24) -> Unix sekunde
export function gtfsToEpoch(dateStr, hms) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, s = 0] = hms.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let off = tzOffsetMin(guess);
  off = tzOffsetMin(guess - off * 60000);
  return Math.round((guess - off * 60000) / 1000);
}

export const hhmm = (hms) => {
  if (!hms) return null;
  const [h, m] = hms.split(":").map(Number);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Vrsta voza na osnovu teksta iz GTFS-a (stop_id kod SNCF-a sadrži naziv proizvoda,
// npr. "StopPoint:OCETGV INOUI-87686006")
export function detectType(...texts) {
  const s = texts.filter(Boolean).join(" ").toUpperCase();
  if (/OUIGO/.test(s)) return "OUIGO";
  if (/LYRIA/.test(s)) return "TGV Lyria";
  if (/INOUI/.test(s)) return "TGV INOUI";
  if (/EUROSTAR|THALYS/.test(s)) return "Eurostar";
  if (/\bICE\b/.test(s)) return "ICE";
  if (/\bTGV\b/.test(s)) return "TGV INOUI";
  if (/INTERCIT/.test(s)) return "Intercités";
  if (/\bTER\b/.test(s)) return "TER";
  return "Ostalo";
}

export function productFromStopId(stopId = "") {
  const m = stopId.match(/OCE(.+?)-\d+$/);
  return m ? m[1] : "";
}

export function env(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Nedostaje promenljiva okruženja ${name}. Pogledaj README.md, korak 4.`);
  }
  return v;
}

// Mali klijent za Supabase REST API (PostgREST) sa service ključem
export function supabaseRest() {
  const base = env("SUPABASE_URL").replace(/\/$/, "") + "/rest/v1";
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  async function call(method, path, body, extra = {}) {
    const res = await fetch(base + path, { method, headers: { ...headers, ...extra }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`Supabase ${method} ${path} -> ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    upsert: (table, rows) => call("POST", `/${table}?on_conflict=id`, rows, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    select: (table, query) => call("GET", `/${table}?${query}`),
    del: (table, query) => call("DELETE", `/${table}?${query}`, null, { Prefer: "return=minimal" }),
    rpc: (fn, args) => call("POST", `/rpc/${fn}`, args),
  };
}

export async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "peron-ingest/1.0" } });
  if (!res.ok) throw new Error(`Preuzimanje ${url} nije uspelo: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
