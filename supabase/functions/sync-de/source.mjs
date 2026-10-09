// Supabase Edge funkcija za Nemačku (Deutsche Bahn), piše u tabelu trains (country "de").
//   ?kind=schedule  red vožnje iz gtfs.de za danas i sutra (jednom dnevno)
//   ?kind=flix      red vožnje FlixTraina (Flix GTFS) za danas i sutra
//   ?kind=rt        DB Timetables: nekoliko glavnih stanica po pozivu (red se rotira), pa kašnjenja u trains
//   ?kind=plan      DB plan unapred (DB ga objavljuje ~18 sati ranije): broj voza se upisuje čim ga DB objavi
// Tajne: DB_CLIENT_ID, DB_API_KEY (Edge Functions → Secrets). Zaštita: x-cron-token kao kod sync-realtime.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { inflateRawSync } from "node:zlib";
import { DE_GTFS_URL, DE_TT_BASE, FLIX_GTFS_URL, buildFlixSchedule, buildGermanSchedule, parseTimetable, ttTime, deNorm, deCategory, germanUpdates, fastEpoch } from "../../../ingest/lib/germany.mjs";
import { parisDate, gtfsToEpoch } from "../../../ingest/lib/util.mjs";
import { parseLine } from "../../../ingest/lib/csv.mjs";
import DE_NET from "../../../lib/network-de.json" with { type: "json" };

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DB_ID = Deno.env.get("DB_CLIENT_ID") || "";
const DB_KEY = Deno.env.get("DB_API_KEY") || "";
const UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
const PER_RUN = 10; // stations per call (about 140 stations, each one every ~14 min); ≈ 12–20 DB calls per minute (limit 60)
const PLAN_AHEAD = 18; // hours: DB publishes its plan about 14–20 hours ahead (later hours answer 404 until published)
const PLAN_CALLS = 20; // plan hours fetched per kind=plan call (every minute); kind=rt makes about 20 calls a minute: together about 40 of the 60 allowed

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
async function tt(path, missing = "") {
  const res = await fetch(DE_TT_BASE + path, { headers: { ...UA, "DB-Client-Id": DB_ID, "DB-Api-Key": DB_KEY, Accept: "application/xml" } });
  if (res.status === 404) return missing;
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
  const rows = buildGermanSchedule(zip, dates, (d) => inflateRawSync(d), DE_NET.land[0]);
  // keep numbers and live data already found for these trains (the timetable is reloaded every day)
  for (let i = 0; i < rows.length; i += 400) await upsert("trains", rows.slice(i, i + 400).map(({ number, ...r }) => r), "id");
  // a new timetable can rename trips: old rows of the same days are removed
  const fresh = new Set(rows.map((r) => r.id));
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.de&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id) && !id.includes("_de_FLX")); // FlixTrain rows come from kind=flix
    for (let i = 0; i < stale.length; i += 80) await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
  }
  await rest("DELETE", `trains?country=eq.de&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  await rest("DELETE", `de_plan?day=lt.${parisDate(-1)}`, null, { Prefer: "return=minimal" });
  await rest("DELETE", `de_plan_hours?hour=lt.${new Date(Date.now() - 2 * 86400e3).toISOString()}`, null, { Prefer: "return=minimal" });
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

// one hour of DB's plan at one station; false = DB has not published that hour yet (404), nothing is marked as done
async function planHour(h, eva, hr) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(hr);
  const g = (t) => p.find((x) => x.type === t).value;
  const xml = await tt(`plan/${eva}/${g("year")}${g("month")}${g("day")}/${g("hour")}`, null);
  if (xml === null) return false;
  const { station, stops } = parseTimetable(xml);
  // every operator counts: EC/RJ/NJ run by ÖBB, SBB, PKP or DSB are not flagged "F" (long distance) by DB
  const rows = stops.filter((s) => s.tl && deCategory(s.tl.c)).map((s) => ({
    eva, sid: s.sid, day: parisDate(0, new Date(ttTime(s.dp?.pt || s.ar?.pt) || hr)), cat: s.tl.c, num: s.tl.n,
    ar_pt: ttTime(s.ar?.pt), dp_pt: ttTime(s.dp?.pt), pp: s.dp?.pp || s.ar?.pp || null,
  }));
  await upsert("de_plan", rows, "eva,sid");
  await upsert("de_plan_hours", [{ eva, hour: hr.toISOString() }], "eva,hour");
  if (station && station !== h.station) { h.station = station; await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { station }, { Prefer: "return=minimal" }); }
  return true;
}

async function pollHub(h, now) {
  const eva = await hubEva(h);
  if (!eva) return 0;
  // planned stops for this hour and the next two, if kind=plan has not fetched them yet (each hour is fetched once)
  const hours = [0, 1, 2].map((k) => new Date(Math.floor(now / 3600000) * 3600000 + k * 3600000));
  const have = new Set((await rest("GET", `de_plan_hours?eva=eq.${eva}&hour=gte.${hours[0].toISOString()}&select=hour`)).map((r) => Date.parse(r.hour)));
  let calls = 0;
  for (const hr of hours) {
    if (have.has(hr.getTime())) continue;
    calls++;
    if (!(await planHour(h, eva, hr))) break;
  }
  // all current changes at this station; only stops we know as long-distance are kept
  // only changes that are new are written (the database disk is small: rewriting the same rows every minute overloaded it on 9.10.2026)
  const known = new Map((await rest("GET", `de_plan?eva=eq.${eva}&day=gte.${parisDate(-1)}&select=sid,day,ar_ct,dp_ct,cp,cs`)).map((r) => [r.sid, r]));
  const xml = await tt(`fchg/${eva}`); calls++;
  const ms = (t) => (t ? Date.parse(t) : null);
  const ch = parseTimetable(xml).stops.filter((s) => known.has(s.sid)).map((s) => ({
    eva, sid: s.sid, day: known.get(s.sid).day,
    ar_ct: ttTime(s.ar?.ct), dp_ct: ttTime(s.dp?.ct), cp: s.dp?.cp || s.ar?.cp || null,
    cs: (s.dp?.cs || s.ar?.cs) === "c" ? "c" : null, updated_at: new Date().toISOString(),
  })).filter((r) => { const o = known.get(r.sid); return ms(o.ar_ct) !== ms(r.ar_ct) || ms(o.dp_ct) !== ms(r.dp_ct) || (o.cp || null) !== r.cp || (o.cs || null) !== r.cs; });
  for (let i = 0; i < ch.length; i += 500) await upsert("de_plan", ch.slice(i, i + 500), "eva,sid");
  await rest("PATCH", `de_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  return calls;
}

// FlixTrain timetable (Flix GTFS, ~30 MB): the big files are read as a stream and only the FlixTrain lines are kept
async function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off }; p += 46 + nl + xl + cl;
  }
  return async (name, keep = null) => {
    const f = files[name]; if (!f) return [];
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.comp);
    let o = 0;
    const src = new ReadableStream({ pull(c) { if (o >= data.length) return c.close(); c.enqueue(data.subarray(o, o + 65536)); o += 65536; } }, { highWaterMark: 1 });
    const reader = (f.method === 8 ? src.pipeThrough(new DecompressionStream("deflate-raw")) : src).getReader();
    const td = new TextDecoder(); let rest = "", head = null; const out = [];
    const line = (l) => {
      if (l.endsWith("\r")) l = l.slice(0, -1); if (!l) return;
      if (!head) { head = parseLine(l.replace(/^\uFEFF/, "")).map((h) => h.trim()); return; }
      if (keep && !keep(l)) return;
      const v = parseLine(l); const r = {}; head.forEach((h, i) => (r[h] = v[i] ?? "")); out.push(r);
    };
    for (;;) { const { value, done } = await reader.read(); if (done) break; const parts = (rest + td.decode(value, { stream: true })).split("\n"); rest = parts.pop(); for (const l of parts) line(l); }
    line(rest);
    return out;
  };
}
async function flix() {
  const dates = [parisDate(0), parisDate(1)];
  const res = await fetch(FLIX_GTFS_URL, { headers: UA });
  if (!res.ok) throw new Error(`flix gtfs -> ${res.status}`);
  const read = await zipEntries(new Uint8Array(await res.arrayBuffer()));
  const isFlx = (l) => l.startsWith("FLX") || l.startsWith('"FLX');
  const files = { trips: await read("trips.txt", isFlx), stop_times: await read("stop_times.txt", isFlx), calendar: await read("calendar.txt", isFlx),
    calendar_dates: await read("calendar_dates.txt", isFlx), stops: [] };
  const need = new Set(files.stop_times.map((r) => r.stop_id));
  files.stops = await read("stops.txt", (l) => need.has(l.slice(0, l.indexOf(","))));
  const rows = buildFlixSchedule(files, dates);
  if (!rows.length) return { kind: "flix", trains: 0, note: "no FlixTrain found – nothing changed" };
  // the train number from Flix is kept (DB confirms it later); live data already written stays
  for (let i = 0; i < rows.length; i += 200) await upsert("trains", rows.slice(i, i + 200), "id");
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.de&service_date=eq.${d}&id=like.*_de_FLX*&limit=1000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0; i < stale.length; i += 80) { await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" }); removed += Math.min(80, stale.length - i); }
  }
  return { kind: "flix", trains: rows.length, removed };
}

// DB's plan ahead of time: the nearest hours first, every station, as far as DB has published (about 18 hours)
async function planAhead() {
  const t0 = Date.now();
  const hubs = (await rest("GET", "de_hubs?select=name,eva,station&eva=not.is.null&order=name")).filter((h) => h.eva);
  const first = Math.floor(Date.now() / 3600000) * 3600000;
  const have = new Set();
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `de_plan_hours?hour=gte.${new Date(first).toISOString()}&select=eva,hour&order=eva,hour&limit=1000&offset=${off}`);
    for (const r of page) have.add(`${r.eva}|${Date.parse(r.hour)}`);
    if (page.length < 1000) break;
  }
  const todo = [];
  for (let k = 0; k < PLAN_AHEAD; k++) for (const h of hubs) if (!have.has(`${h.eva}|${first + k * 3600000}`)) todo.push([h, first + k * 3600000]);
  let calls = 0, fetched = 0; const unpublished = new Set(), errors = [];
  for (const [h, ms] of todo) {
    if (calls >= PLAN_CALLS) break;
    if (unpublished.has(h.eva)) continue; // a later hour of the same station is not published either
    calls++;
    try { if (await planHour(h, h.eva, new Date(ms))) fetched++; else unpublished.add(h.eva); }
    catch (e) { errors.push(`${h.name}: ${String(e).slice(0, 120)}`); unpublished.add(h.eva); }
  }
  return { kind: "plan", missing: todo.length, calls, fetched, notYetPublished: unpublished.size, errors, ms: Date.now() - t0 };
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
  // tomorrow too: DB's plan reaches past midnight, and a train gets its number as soon as DB publishes it
  const days = [parisDate(-1), parisDate(0), parisDate(1)];
  // a station can be written differently in gtfs.de and DB ("Frankfurt (Main) Hbf" / "Frankfurt(Main)Hbf"): both names count
  const evaName = new Map((await rest("GET", "de_hubs?select=name,eva,station&eva=not.is.null")).map((h) => [h.eva, [...new Set([deNorm(h.name), deNorm(h.station || "")].filter(Boolean))]]));
  const plan = [];
  const since = new Date(Date.now() - 12 * 3600e3).toISOString();
  for (let off = 0; ; off += 1000) {
    // only stops from 12 hours ago on (night trains) are needed for the trains running now
    const page = await rest("GET", `de_plan?day=in.(${days.join(",")})&or=(dp_pt.gte.%22${since}%22,ar_pt.gte.%22${since}%22)&select=eva,cat,num,ar_pt,dp_pt,ar_ct,dp_ct,pp,cp,cs&order=eva,sid&limit=1000&offset=${off}`);
    for (const p of page) plan.push({ ...p, hubs: evaName.get(p.eva) || [] });
    if (page.length < 1000) break;
  }
  const now = Math.floor(Date.now() / 1000);
  const trains = [], ahead = new Set();
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `trains?country=eq.de&service_date=in.(${days.join(",")})&select=id,service_date,type,number,stops,delay_min&order=id&limit=1000&offset=${off}`);
    for (const r of page) {
      const st = r.stops || []; if (st.length < 2) continue;
      const a = fastEpoch(r.service_date, st[0].dep || st[0].arr), b = fastEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
      if (now >= a - 3 * 3600 && now <= b + 7200 + (r.delay_min || 0) * 60) trains.push(r);
      // a later train still without its number: matched against the plan DB has already published
      else if (!r.number && r.type !== "FLX" && a > now && a <= now + PLAN_AHEAD * 3600) { trains.push(r); ahead.add(r.id); }
    }
    if (page.length < 1000) break;
  }
  // later trains are written only once, when their number is found (no live data yet, so nothing else to write)
  const updates = germanUpdates(trains, plan, now).filter((u) => !ahead.has(u.id) || u.number);
  let written = 0;
  for (let i = 0; i < updates.length; i += 300) written += await rest("POST", "rpc/apply_de_updates", { payload: updates.slice(i, i + 300) });
  return { kind: "rt", hubs: hubs.map((h) => h.name), calls, planRows: plan.length, candidates: trains.length, numbersAhead: updates.filter((u) => ahead.has(u.id)).length, written, errors, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && (await rest("POST", "rpc/cron_token_ok", { t: token }));
  if (!ok) return json({ error: "forbidden" }, 403);
  if (!DB_ID || !DB_KEY) return json({ error: "DB_CLIENT_ID / DB_API_KEY not set" }, 500);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    const out = kind === "schedule" ? await schedule() : kind === "flix" ? await flix() : kind === "plan" ? await planAhead() : await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
