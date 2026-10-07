// Supabase Edge funkcija za Luksemburg (CFL): kašnjenja uživo sa mobiliteit.lu (svakog minuta).
//   Red vožnje i dalje stiže iz GTFS-a (GitHub Actions, COUNTRY=lu). API daje samo table polazaka po stanici:
//   svakog minuta Luxembourg Gare Centrale + nekoliko drugih stanica redom; podaci se čuvaju u lu_rt i spajaju po broju voza.
// Tajna: LU_API_KEY (Edge Functions → Secrets). Zaštita: x-cron-token kao kod sync-realtime.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { LU_API, luxExt, parseLuxBoard, luxUpdates } from "../../../ingest/lib/luxembourg.mjs";
import { parisDate, gtfsToEpoch } from "../../../ingest/lib/util.mjs";

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LU_KEY = Deno.env.get("LU_API_KEY") || "";
const PER_RUN = 4; // stations besides Luxembourg per call

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function board(ext) {
  const q = new URLSearchParams({ accessId: LU_KEY, format: "json", lang: "fr", id: ext, duration: "90", maxJourneys: "200", products: "7" });
  const res = await fetch(`${LU_API}departureBoard?${q}`, { headers: { "Accept-Encoding": "identity" } });
  if (!res.ok) throw new Error(`mobiliteit.lu ${ext} -> ${res.status}`);
  return parseLuxBoard(await res.json(), ext);
}

async function realtime() {
  const t0 = Date.now();
  const days = [parisDate(-1), parisDate(0)];
  const now = Math.floor(Date.now() / 1000);
  const toEpoch = (d, t) => gtfsToEpoch(d, t);
  // trains running now (or within the hour)
  const trains = [];
  for (const r of await rest("GET", `trains?country=eq.lu&service_date=in.(${days.join(",")})&select=id,service_date,number,stops,delay_min&limit=2000`)) {
    const st = r.stops || []; if (st.length < 2) continue;
    const a = toEpoch(r.service_date, st[0].dep || st[0].arr), b = toEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
    if (now >= a - 3600 && now <= b + 7200 + (r.delay_min || 0) * 60) trains.push(r);
  }
  // stations served by them, busiest first; Luxembourg every call, the others in turn
  const count = new Map();
  for (const tr of trains) for (const s of tr.stops) { const e = luxExt(s.id); if (e) count.set(e, (count.get(e) || 0) + 1); }
  const MAIN = "200405060";
  const others = [...count.keys()].filter((e) => e !== MAIN && count.get(e) >= 2).sort();
  const slots = Math.max(1, Math.ceil(others.length / PER_RUN)), slot = Math.floor(now / 60) % slots;
  const pick = [MAIN, ...others.slice(slot * PER_RUN, slot * PER_RUN + PER_RUN)];
  const rows = [], errors = [];
  for (const ext of pick) { try { rows.push(...await board(ext)); } catch (e) { errors.push(String(e).slice(0, 120)); } }
  const stamp = new Date().toISOString();
  if (rows.length) await rest("POST", "lu_rt?on_conflict=num,ext,pt", rows.map((r) => ({ ...r, updated_at: stamp })), { Prefer: "resolution=merge-duplicates,return=minimal" });
  // everything known from the last 14 hours
  const since = new Date(Date.now() - 14 * 3600e3).toISOString();
  const rt = await rest("GET", `lu_rt?pt=gte.${encodeURIComponent(since)}&select=num,ext,pt,ct,cancelled,pf,pf_plan&limit=20000`);
  const updates = luxUpdates(trains, rt, toEpoch, now);
  let written = 0;
  for (let i = 0; i < updates.length; i += 300) written += await rest("POST", "rpc/apply_rt_delays", { payload: updates.slice(i, i + 300) });
  await rest("DELETE", `lu_rt?pt=lt.${encodeURIComponent(new Date(Date.now() - 36 * 3600e3).toISOString())}`, null, { Prefer: "return=minimal" });
  return { kind: "rt", stations: pick, boardRows: rows.length, known: rt.length, candidates: trains.length, written, errors, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && (await rest("POST", "rpc/cron_token_ok", { t: token }));
  if (!ok) return json({ error: "forbidden" }, 403);
  if (!LU_KEY) return json({ error: "LU_API_KEY not set" }, 500);
  try {
    const out = await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
