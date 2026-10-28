// Dnevna provera podataka i mapa (pokreće se posle reda vožnje): node ingest/check-maps.mjs
// Za svaki današnji voz proverava:
//  1) da nije autobus (SNCF autobusi uz TGV, šatlovi sa 6-cifrenim brojem),
//  2) da nijedna stanica nema lažne koordinate 0,0 (to bi je stavilo u Afriku); stanica bez koordinata u feedu
//     (npr. nemačke stanice u holandskom feedu) samo se ne crta na mapi i nije greška,
//  3) da svaka stanica ima svoju tačku na liniji mape te zemlje (ne samo "negde blizu linije"),
//  4) da mapa ima liniju između dve uzastopne stanice, bez velikog zaobilaska,
//  5) da nijedan voz nema nemoguće kašnjenje (preko 12 sati),
//  6) kako su izgledali podaci uživo JUČE (upozorenja, ne greške – samo se ispišu, i u rezimeu koraka na GitHubu):
//     voz kome je otkazano 3/4 stanica ili više a nije označen kao otkazan (27.10.2026: ICE 2510 Berlin–Hamburg bio je
//     otkazan, a na sajtu "na vreme"), i zemlja u kojoj je broj vozova sa podacima uživo pao na manje od pola
//     nedeljnog proseka (feed ne radi). Zemlja bez ijednog voza sa podacima uživo juče JESTE greška.
// Ako nešto nije u redu, ispisuje tačno šta (zemlja, voz, stanice) i završava sa greškom,
// pa GitHub pošalje e-mail da je korak "Provera mapa i podataka" pao.
// Za probu bez baze: TRAINS_FILE=trains.json (niz vozova kao u tabeli trains).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const COUNTRIES = (process.env.COUNTRIES || "fr,ch,be,nl,lu,es,pt,de,at").split(",");
const FILE = { fr: "network.json" }; // ostale: network-XX.json
const SNAP = { ch: 0.035, lu: 0.025, fr: 0.1 }; // isto kao u lib/geo.js; ostale 0.03
const DETOUR = 1.8, MIN_HOP = 0.08; // linija sme da vijuga, ali ne duplo duže od prave (Martigny, Albula su ispod 1.8)
// Stvarna pruga koja zaista ide okolo (provereno): Albula Filisur–Tiefencastel–Thusis–Chur, Alvia Calatayud–Zaragoza–Tudela
const REAL_DETOURS = new Set(["ch:Chur|Filisur", "es:Calatayud|Tudela de Navarra"]);
const today = process.env.TODAY || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const dayBefore = (d, n = 1) => new Date(Date.parse(d + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
const NO_LIVE = new Set(["pt"]); // zemlje bez podataka uživo (samo red vožnje)

async function loadTrains(day = today, fields = "id,country,number,type,delay_min,stops") {
  if (process.env.TRAINS_FILE) return day === today ? JSON.parse(await readFile(process.env.TRAINS_FILE, "utf8")) : [];
  const base = process.env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1", key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  // per country and in the order of the index (country, service_date, dep): small fast requests; a busy database is tried again
  const get = async (url) => {
    for (let i = 1; ; i++) {
      const res = await fetch(url, { headers });
      if (res.ok) return res.json();
      const msg = `Supabase -> ${res.status}: ${await res.text()}`;
      if (i >= 5) throw new Error(msg);
      console.log(`${msg} – ponovo za ${i * 10} s`);
      await new Promise((r) => setTimeout(r, i * 10000));
    }
  };
  const out = [];
  for (const c of COUNTRIES) for (let off = 0; ; off += 500) {
    const page = await get(`${base}/trains?select=${fields}&country=eq.${c}&service_date=eq.${day}&order=dep,id&limit=500&offset=${off}`);
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

function checkCountry(c, net, trains, problems) {
  const { lon0, lon1, lat0, lat1 } = net.bounds;
  const COS = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const N = net.nodes, snap = SNAP[c] ?? 0.03;
  const d2 = (lat, lon, k) => Math.hypot((N[k][1] - lon) * COS, N[k][0] - lat);
  const adj = {}, segs = [];
  for (const [, p] of net.lines) for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1], p[i]], w = Math.hypot((N[a][1] - N[b][1]) * COS, N[a][0] - N[b][0]);
    (adj[a] ||= []).push([b, w]); (adj[b] ||= []).push([a, w]); segs.push([a, b]);
  }
  const onLine = Object.keys(adj);
  const named = onLine.filter((k) => N[k][2]);
  const inside = (s) => s.lat >= lat0 && s.lat <= lat1 && s.lon >= lon0 && s.lon <= lon1;
  const segDist = (lat, lon) => {
    let best = Infinity;
    for (const [a, b] of segs) {
      const ax = N[a][1] * COS, ay = N[a][0], bx = N[b][1] * COS, by = N[b][0], px = lon * COS, py = lat;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  };
  const stopInfo = new Map(); // "lat,lon" -> { ok, node }
  const info = (s) => {
    const k = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    if (!stopInfo.has(k)) {
      const nearNamed = named.reduce((b, n) => { const d = d2(s.lat, s.lon, n); return d < b[1] ? [n, d] : b; }, [null, Infinity]);
      stopInfo.set(k, { ok: nearNamed[1] < snap, node: nearNamed[0], far: segDist(s.lat, s.lon) });
    }
    return stopInfo.get(k);
  };
  const route = (a, b, lim) => {
    const dist = { [a]: 0 }, done = new Set(), todo = [a];
    while (todo.length) {
      todo.sort((p, q) => dist[p] - dist[q]); const u = todo.shift();
      if (done.has(u)) continue; done.add(u); if (u === b) return dist[b]; if (dist[u] > lim) return Infinity;
      for (const [v, w] of adj[u] || []) if (dist[u] + w < (dist[v] ?? Infinity)) { dist[v] = dist[u] + w; todo.push(v); }
    }
    return Infinity;
  };
  const missing = new Map(), detours = new Map();
  for (const t of trains) {
    const st = (t.stops || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && !(s.lat === 0 && s.lon === 0));
    for (const s of st) if (inside(s) && !info(s).ok) missing.set(s.name, `${t.type} ${t.number}, ${Math.round(info(s).far * 111)} km od linije`);
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i];
      if (!inside(a) || !inside(b)) continue;
      const A = info(a), B = info(b);
      if (!A.ok || !B.ok || A.node === B.node) continue;
      const direct = Math.hypot((N[A.node][1] - N[B.node][1]) * COS, N[A.node][0] - N[B.node][0]);
      // short hops too (19.10.2026: Flensburg → Padborg, 7 km, was drawn back through Schleswig): the line may be
      // 1.8× the straight distance or MIN_HOP (~9 km) longer, whichever is more
      const key = `${a.name} → ${b.name}`;
      if (detours.has(key) || REAL_DETOURS.has(`${c}:${[a.name, b.name].sort().join("|")}`)) continue;
      const limit = Math.max(direct * DETOUR, direct + MIN_HOP), len = route(A.node, B.node, limit * 1.5);
      if (len > limit) detours.set(key, `${t.type} ${t.number}, ${len === Infinity ? "nema linije" : `${Math.round(len * 111)} km umesto ${Math.round(direct * 111)} km`}`);
    }
  }
  for (const [name, tr] of missing) problems.push(`${c}: stanica nije na mapi: ${name} (npr. ${tr})`);
  for (const [hop, why] of detours) problems.push(`${c}: loša linija na mapi: ${hop} (${why})`);
}

async function main() {
  const trains = (await loadTrains()).filter((t) => COUNTRIES.includes(t.country));
  console.log(`Provera za ${today}: ${trains.length} vozova (${COUNTRIES.join(", ")})`);
  const problems = [];
  for (const t of trains) {
    if (t.country === "fr" && (/_OCESN\d+R/.test(t.id) || /^\d{6,}$/.test(t.number || ""))) problems.push(`fr: autobus ili šatl među vozovima: ${t.type} ${t.number} (${t.id})`);
    const zero = (t.stops || []).filter((s) => s.lat === 0 && s.lon === 0);
    if (zero.length) problems.push(`${t.country}: stanica sa koordinatama 0,0: ${zero.map((s) => s.name).join(", ")} (${t.type} ${t.number})`);
    // a delay over 12 h is a data error (9.10.2026: RE 5122 "+1450 min" from a wrong date in mobiliteit.lu)
    const worst = Math.max(t.delay_min || 0, ...(t.stops || []).map((s) => (typeof s.delay === "number" ? s.delay : 0)));
    if (worst > 720) problems.push(`${t.country}: nemoguće kašnjenje ${worst} min: ${t.type} ${t.number} (${t.id})`);
  }
  for (const c of COUNTRIES) {
    const mine = trains.filter((t) => t.country === c);
    if (!mine.length) { console.log(`${c}: nema vozova za danas – preskačem`); continue; }
    const net = JSON.parse(await readFile(join(here, "..", "lib", FILE[c] || `network-${c}.json`), "utf8"));
    const before = problems.length;
    checkCountry(c, net, mine, problems);
    console.log(`${c}: ${mine.length} vozova, problema: ${problems.length - before}`);
  }
  // 6) yesterday's live data: warnings only, and an error when a country had no live data at all
  const warnings = [];
  try {
    const y = dayBefore(today);
    const yt = await loadTrains(y, "id,country,number,type,cancelled,rt_updated_at,stops");
    for (const t of yt) {
      const st = t.stops || [], sk = st.filter((s) => s.skipped).length;
      if (!t.cancelled && st.length >= 3 && sk / st.length >= 0.75)
        warnings.push(`${t.country}: ${t.type} ${t.number} ${st[0]?.name} → ${st[st.length - 1]?.name}: otkazano ${sk} od ${st.length} stanica, a nije označen kao otkazan`);
    }
    // the week before, for comparison: only the count of trains with live data (small requests)
    const live = (rows) => rows.filter((t) => t.rt_updated_at).length;
    const week = [];
    for (let k = 2; k <= 8; k++) week.push(await loadTrains(dayBefore(today, k), "country,rt_updated_at"));
    for (const c of COUNTRIES) {
      if (NO_LIVE.has(c)) continue;
      const mine = yt.filter((t) => t.country === c);
      if (!mine.length) continue;
      const n = live(mine), canc = mine.filter((t) => t.cancelled).length;
      console.log(`${c} juče: ${mine.length} vozova, sa podacima uživo ${n} (${Math.round((100 * n) / mine.length)} %), otkazano ${canc}`);
      if (!n) { problems.push(`${c}: juče (${y}) nijedan voz nije dobio podatke uživo – feed verovatno ne radi`); continue; }
      const past = week.map((rows) => live(rows.filter((t) => t.country === c)));
      const avg = past.reduce((a, b) => a + b, 0) / past.length;
      if (avg >= 20 && n < avg / 2) warnings.push(`${c}: juče samo ${n} vozova sa podacima uživo, prethodnih 7 dana prosečno ${Math.round(avg)}`);
    }
  } catch (e) { warnings.push(`provera jučerašnjih podataka nije uspela: ${String(e).slice(0, 200)}`); }
  if (warnings.length) {
    console.log(`\n⚠ Upozorenja (podaci uživo juče): ${warnings.length}`);
    for (const w of warnings.slice(0, 100)) console.log(" - " + w);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ⚠ Podaci uživo juče: ${warnings.length} upozorenja\n\n${warnings.slice(0, 100).map((w) => "- " + w).join("\n")}\n`);
    }
  }
  if (problems.length) {
    console.log(`\n✖ Pronađeno problema: ${problems.length}`);
    for (const p of problems.slice(0, 200)) console.log(" - " + p);
    process.exit(1);
  }
  console.log("\n✔ Sve stanice su na mapama, nema autobusa, stanica sa koordinatama 0,0 ni nemogućih kašnjenja.");
}

main().catch((e) => { console.error(e); process.exit(1); });
