// Dnevna provera podataka i mapa (pokreće se posle reda vožnje): node ingest/check-maps.mjs
// Za svaki današnji voz proverava:
//  1) da nije autobus (SNCF autobusi uz TGV, šatlovi sa 6-cifrenim brojem),
//  2) da svaka stanica ima koordinate (ne 0,0),
//  3) da svaka stanica ima svoju tačku na liniji mape te zemlje (ne samo "negde blizu linije"),
//  4) da mapa ima liniju između dve uzastopne stanice, bez velikog zaobilaska.
// Ako nešto nije u redu, ispisuje tačno šta (zemlja, voz, stanice) i završava sa greškom,
// pa GitHub pošalje e-mail da je korak "Provera mapa i podataka" pao.
// Za probu bez baze: TRAINS_FILE=trains.json (niz vozova kao u tabeli trains).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const COUNTRIES = (process.env.COUNTRIES || "fr,ch,be,nl,lu,es,pt,de").split(",");
const FILE = { fr: "network.json" }; // ostale: network-XX.json
const SNAP = { ch: 0.035, lu: 0.025, fr: 0.1 }; // isto kao u lib/geo.js; ostale 0.03
const DETOUR = 1.8, MIN_HOP = 0.08; // linija sme da vijuga, ali ne duplo duže od prave (Martigny, Albula su ispod 1.8)
// Stvarna pruga koja zaista ide okolo (provereno): Albula Filisur–Tiefencastel–Thusis–Chur, Alvia Calatayud–Zaragoza–Tudela
const REAL_DETOURS = new Set(["ch:Chur|Filisur", "es:Calatayud|Tudela de Navarra"]);
const today = process.env.TODAY || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

async function loadTrains() {
  if (process.env.TRAINS_FILE) return JSON.parse(await readFile(process.env.TRAINS_FILE, "utf8"));
  const base = process.env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1", key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  const out = [];
  for (let off = 0; ; off += 1000) {
    const res = await fetch(`${base}/trains?select=id,country,number,type,stops&service_date=eq.${today}&order=id&limit=1000&offset=${off}`, { headers });
    if (!res.ok) throw new Error(`Supabase -> ${res.status}: ${await res.text()}`);
    const page = await res.json(); out.push(...page);
    if (page.length < 1000) break;
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
      const direct = Math.hypot((a.lon - b.lon) * COS, a.lat - b.lat);
      if (direct < MIN_HOP) continue;
      const key = `${a.name} → ${b.name}`;
      if (detours.has(key) || REAL_DETOURS.has(`${c}:${[a.name, b.name].sort().join("|")}`)) continue;
      const r = route(A.node, B.node, direct * DETOUR * 1.5) / direct;
      if (r > DETOUR) detours.set(key, `${t.type} ${t.number}, ${r === Infinity ? "nema linije" : `${r.toFixed(1)}× duže od prave`}`);
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
    const zero = (t.stops || []).filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || (s.lat === 0 && s.lon === 0));
    if (zero.length) problems.push(`${t.country}: stanica bez koordinata: ${zero.map((s) => s.name).join(", ")} (${t.type} ${t.number})`);
  }
  for (const c of COUNTRIES) {
    const mine = trains.filter((t) => t.country === c);
    if (!mine.length) { console.log(`${c}: nema vozova za danas – preskačem`); continue; }
    const net = JSON.parse(await readFile(join(here, "..", "lib", FILE[c] || `network-${c}.json`), "utf8"));
    const before = problems.length;
    checkCountry(c, net, mine, problems);
    console.log(`${c}: ${mine.length} vozova, problema: ${problems.length - before}`);
  }
  if (problems.length) {
    console.log(`\n✖ Pronađeno problema: ${problems.length}`);
    for (const p of problems.slice(0, 200)) console.log(" - " + p);
    process.exit(1);
  }
  console.log("\n✔ Sve stanice su na mapama, nema autobusa ni stanica bez koordinata.");
}

main().catch((e) => { console.error(e); process.exit(1); });
