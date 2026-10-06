// Supabase Edge funkcija za Nemačku (Deutsche Bahn), piše u tabelu trains (country "de").
//   ?kind=schedule  red vožnje iz gtfs.de za danas i sutra (jednom dnevno)
//   ?kind=rt        DB Timetables: nekoliko glavnih stanica po pozivu (red se rotira), pa kašnjenja u trains
// Tajne: DB_CLIENT_ID, DB_API_KEY (Edge Functions → Secrets). Zaštita: x-cron-token kao kod sync-realtime.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { inflateRawSync } from "node:zlib";
import { DE_GTFS_URL, DE_TT_BASE, buildGermanSchedule, parseTimetable, ttTime, deNorm, deCategory, germanUpdates, fastEpoch } from "../../../ingest/lib/germany.mjs";
import { parisDate, gtfsToEpoch } from "../../../ingest/lib/util.mjs";

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DB_ID = Deno.env.get("DB_CLIENT_ID") || "";
const DB_KEY = Deno.env.get("DB_API_KEY") || "";
const UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
const PER_RUN = 4; // stations per call; with a call every minute ≈ 6 + plan calls per minute (limit 60)

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const upsert = (table, rows, onConflict) => rows.length ? rest("POST", `${table}?on_conflict=${onConflict}`, rows, { Prefer: "resolution=merge-duplicates,return=minimal" }) : null;
async function tt(path) {
  const res = await fetch(DE_TT_BASE + path, { headers: { ...UA, "DB-Client-Id": DB_ID, "DB-Api-Key": DB_KEY, Accept: "application/xml" } });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`timetables ${path.split("/")[0]} -> ${res.status}`);
  return res.text();
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function schedule() {
  const today = parisDate(0);
  const dates = [today, parisDate(1)];
  const res = await fetch(DE_GTFS_URL, { headers: UA });
  if (!res.ok) throw new Error(`gtfs.de -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildGermanSchedule(zip, dates, (d) => inflateRawSync(d));
  // keep numbers and live data already found for these trains (the timetable is reloaded every day)
  for (let i = 0; i < rows.length; i += 400) await upsert("trains", rows.slice(i, i + 400).map(({ number, ...r }) => r), "id");
  // a new timetable can rename trips: old rows of the same days are removed
  const fresh = new Set(rows.map((r) => r.id));
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.de&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0; i < stale.length; i += 80) await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
  }
  await rest("DELETE", `trains?country=eq.de&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  await rest("DELETE", `de_plan?day=lt.${parisDate(-1)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length, bytes: zip.length };
}

async function hubEva(h) {
  if (h.eva) return h.eva;
  const xml = await tt(`station/${encodeURIComponent(h.name)}`);
  const all = [...xml.matchAll(/<station ([^>]*)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([a-z0-9]+)=['"]([^'"]*)['"]/gi)].map((x) => [x[1], x[2]])));
  const hit = all.find((s) => deNorm(s.name) === deNorm(h.name)) || all[0];
  const eva = hit?.eva || null;
  await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { eva, last_error: eva ? null : "station not found", ...(eva ? {} : { last_fchg: new Date().toISOString() }) }, { Prefer: "return=minimal" });
  return eva;
}

async function pollHub(h, now) {
  const eva = await hubEva(h);
  if (!eva) return 0;
  // planned stops for this hour and the next two (each hour is fetched once)
  const hours = [0, 1, 2].map((k) => new Date(Math.floor(now / 3600000) * 3600000 + k * 3600000));
  const have = new Set((await rest("GET", `de_plan_hours?eva=eq.${eva}&hour=gte.${hours[0].toISOString()}&select=hour`)).map((r) => Date.parse(r.hour)));
  let calls = 0;
  for (const hr of hours) {
    if (have.has(hr.getTime())) continue;
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(hr);
    const g = (t) => p.find((x) => x.type === t).value;
    const xml = await tt(`plan/${eva}/${g("year")}${g("month")}${g("day")}/${g("hour")}`); calls++;
    const { station, stops } = parseTimetable(xml);
    const rows = stops.filter((s) => s.tl && s.tl.f === "F" && deCategory(s.tl.c)).map((s) => ({
      eva, sid: s.sid, day: parisDate(0, new Date(ttTime(s.dp?.pt || s.ar?.pt) || hr)), cat: s.tl.c, num: s.tl.n,
      ar_pt: ttTime(s.ar?.pt), dp_pt: ttTime(s.dp?.pt), pp: s.dp?.pp || s.ar?.pp || null,
    }));
    await upsert("de_plan", rows, "eva,sid");
    await upsert("de_plan_hours", [{ eva, hour: hr.toISOString() }], "eva,hour");
    if (station && station !== h.station) { h.station = station; await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { station }, { Prefer: "return=minimal" }); }
  }
  // all current changes at this station; only stops we know as long-distance are kept
  const known = new Map((await rest("GET", `de_plan?eva=eq.${eva}&day=gte.${parisDate(-1)}&select=sid,day`)).map((r) => [r.sid, r.day]));
  const xml = await tt(`fchg/${eva}`); calls++;
  const ch = parseTimetable(xml).stops.filter((s) => known.has(s.sid)).map((s) => ({
    eva, sid: s.sid, day: known.get(s.sid),
    ar_ct: ttTime(s.ar?.ct), dp_ct: ttTime(s.dp?.ct), cp: s.dp?.cp || s.ar?.cp || null,
    cs: (s.dp?.cs || s.ar?.cs) === "c" ? "c" : null, updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < ch.length; i += 500) await upsert("de_plan", ch.slice(i, i + 500), "eva,sid");
  await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  return calls;
}

async function realtime() {
  const t0 = Date.now();
  const hubs = await rest("GET", `de_hubs?select=name,eva,station,last_fchg&order=last_fchg.asc.nullsfirst&limit=${PER_RUN}`);
  let calls = 0; const errors = [];
  for (const h of hubs) {
    try { calls += await pollHub(h, Date.now()); }
    catch (e) { errors.push(`${h.name}: ${String(e).slice(0, 120)}`); await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: String(e).slice(0, 200) }, { Prefer: "return=minimal" }); }
  }
  // match everything known to the trains running now and write their delays
  const days = [parisDate(-1), parisDate(0)];
  // a station can be written differently in gtfs.de and DB ("Frankfurt (Main) Hbf" / "Frankfurt(Main)Hbf"): both names count
  const evaName = new Map((await rest("GET", "de_hubs?select=name,eva,station&eva=not.is.null")).map((h) => [h.eva, [...new Set([deNorm(h.name), deNorm(h.station || "")].filter(Boolean))]]));
  const plan = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `de_plan?day=in.(${days.join(",")})&select=eva,cat,num,ar_pt,dp_pt,ar_ct,dp_ct,pp,cp,cs&order=eva,sid&limit=1000&offset=${off}`);
    for (const p of page) plan.push({ ...p, hubs: evaName.get(p.eva) || [] });
    if (page.length < 1000) break;
  }
  const now = Math.floor(Date.now() / 1000);
  const trains = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `trains?country=eq.de&service_date=in.(${days.join(",")})&select=id,service_date,type,stops,delay_min&order=id&limit=1000&offset=${off}`);
    for (const r of page) {
      const st = r.stops || []; if (st.length < 2) continue;
      const a = fastEpoch(r.service_date, st[0].dep || st[0].arr), b = fastEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
      if (now >= a - 3600 && now <= b + 7200 + (r.delay_min || 0) * 60) trains.push(r);
    }
    if (page.length < 1000) break;
  }
  const updates = germanUpdates(trains, plan, now);
  let written = 0;
  for (let i = 0; i < updates.length; i += 300) written += await rest("POST", "rpc/apply_de_updates", { payload: updates.slice(i, i + 300) });
  return { kind: "rt", hubs: hubs.map((h) => h.name), calls, planRows: plan.length, candidates: trains.length, written, errors, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && (await rest("POST", "rpc/cron_token_ok", { t: token }));
  if (!ok) return json({ error: "forbidden" }, 403);
  if (!DB_ID || !DB_KEY) return json({ error: "DB_CLIENT_ID / DB_API_KEY not set" }, 500);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    const out = kind === "schedule" ? await schedule() : await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
