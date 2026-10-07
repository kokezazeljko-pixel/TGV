// Supabase Edge funkcija za Austriju (ÖBB), piše u tabelu trains (country "at").
//   ?kind=schedule  red vožnje iz ÖBB GTFS za danas i sutra (jednom dnevno). Zip ima ~170 MB, ali skoro sve je shapes.txt:
//                   potrebni fajlovi (~3 MB) se čitaju HTTP range zahtevima, bez skidanja celog zipa.
//   ?kind=rt        DB Timetables (isti izvor i isto uparivanje kao za Nemačku) na austrijskim stanicama iz tabele at_hubs
//   ?kind=preview   kao schedule, ali NE piše u trains: samo broj vozova i primeri (provera pre objavljivanja)
// Tajne: DB_CLIENT_ID, DB_API_KEY (Edge Functions → Secrets). Zaštita: x-cron-token kao kod sync-de.
// Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { DE_TT_BASE, parseTimetable, ttTime, deNorm, germanUpdates, fastEpoch } from "../../../ingest/lib/germany.mjs";
import { AT_GTFS_URL, atCategory, buildAustrianSchedule } from "../../../ingest/lib/austria.mjs";
import { parisDate } from "../../../ingest/lib/util.mjs";
import { parseLine } from "../../../ingest/lib/csv.mjs";
import AT_NET from "../../../lib/network-at.json" with { type: "json" };

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DB_ID = Deno.env.get("DB_CLIENT_ID") || "";
const DB_KEY = Deno.env.get("DB_API_KEY") || "";
const UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };
const PER_RUN = 6; // stations per call (~30 stations, each one every ~5 min); with sync-de together well under DB's 60 calls per minute

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

// ---- the zip, read in pieces (HTTP range requests)
async function range(a, b) {
  const r = await fetch(AT_GTFS_URL, { headers: { ...UA, Range: `bytes=${a}-${b}` } });
  if (r.status !== 206) throw new Error(`ÖBB GTFS range -> ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function zipDir() {
  const h = await fetch(AT_GTFS_URL, { method: "HEAD", headers: UA });
  if (!h.ok) throw new Error(`ÖBB GTFS -> ${h.status} (new timetable year? see AT_GTFS_URL)`);
  const size = Number(h.headers.get("content-length"));
  const tail = await range(Math.max(0, size - 65536), size - 1), dv = new DataView(tail.buffer);
  let e = -1; for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("ÖBB GTFS: not a zip file");
  const count = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  const cd = await range(cdOff, cdOff + cdSize - 1), cv = new DataView(cd.buffer);
  const files = {}; let p = 0;
  for (let n = 0; n < count; n++) {
    const method = cv.getUint16(p + 10, true), comp = cv.getUint32(p + 20, true), nl = cv.getUint16(p + 28, true), xl = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true), off = cv.getUint32(p + 42, true);
    files[new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl)).split("/").pop()] = { method, comp, off };
    p += 46 + nl + xl + cl;
  }
  return files;
}
// one file as row objects, streamed (keep: optional quick test on the raw line, to skip rows early)
async function readCsv(files, name, keep = null) {
  const f = files[name]; if (!f) return [];
  const head = await range(f.off, f.off + 29), hv = new DataView(head.buffer);
  const start = f.off + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const r = await fetch(AT_GTFS_URL, { headers: { ...UA, Range: `bytes=${start}-${start + f.comp - 1}` } });
  if (r.status !== 206) throw new Error(`ÖBB GTFS ${name} -> ${r.status}`);
  const reader = (f.method === 8 ? r.body.pipeThrough(new DecompressionStream("deflate-raw")) : r.body).getReader();
  const td = new TextDecoder(); let rest = "", cols = null; const out = [];
  const line = (l) => {
    if (l.endsWith("\r")) l = l.slice(0, -1);
    if (!l) return;
    if (!cols) { cols = parseLine(l.replace(/^﻿/, "")).map((s) => s.trim()); return; }
    if (keep && !keep(l)) return;
    const v = parseLine(l), o = {};
    cols.forEach((c, i) => (o[c] = v[i] ?? ""));
    out.push(o);
  };
  for (;;) { const { value, done } = await reader.read(); if (done) break; const parts = (rest + td.decode(value, { stream: true })).split("\n"); rest = parts.pop() || ""; for (const l of parts) line(l); }
  line(rest);
  return out;
}

async function loadSchedule() {
  const dates = [parisDate(0), parisDate(1)];
  const files = await zipDir();
  const ymds = dates.map((d) => d.replaceAll("-", ""));
  const routes = await readCsv(files, "routes.txt");
  const trips = (await readCsv(files, "trips.txt")).filter((r) => atCategory((r.trip_short_name || "").trim().split(/\s+/)[0]));
  const tripIds = new Set(trips.map((r) => r.trip_id));
  // stop_times is the big one (~16 MB): only rows of long-distance trips are parsed
  const stop_times = await readCsv(files, "stop_times.txt", (l) => tripIds.has(l.slice(l[0] === '"' ? 1 : 0, l.indexOf(l[0] === '"' ? '"' : ",", 1))));
  const stops = await readCsv(files, "stops.txt");
  const calendar = await readCsv(files, "calendar.txt");
  const calendar_dates = await readCsv(files, "calendar_dates.txt", (l) => ymds.some((y) => l.includes(y)));
  return { dates, rows: buildAustrianSchedule({ routes, trips, stop_times, stops, calendar, calendar_dates }, dates, AT_NET.land[0]) };
}

async function schedule() {
  const { dates, rows } = await loadSchedule();
  if (rows.length < 100) throw new Error(`only ${rows.length} trains found – nothing changed`); // a broken file never empties the board
  for (let i = 0; i < rows.length; i += 300) await upsert("trains", rows.slice(i, i + 300), "id");
  const fresh = new Set(rows.map((r) => r.id));
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.at&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0; i < stale.length; i += 80)
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
  }
  await rest("DELETE", `trains?country=eq.at&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length };
}

async function preview() {
  const { dates, rows } = await loadSchedule();
  const byType = {}; for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
  const dup = new Map(); for (const r of rows) { const k = r.service_date + "|" + r.type + "|" + r.number; dup.set(k, (dup.get(k) || 0) + 1); }
  return { kind: "preview", dates, trains: rows.length, byType, sameNumberTwice: [...dup].filter(([, n]) => n > 1).map(([k]) => k).slice(0, 40), sample: rows.filter((r) => r.service_date === dates[0]).slice(0, 3) };
}

// ---- live data: DB Timetables at the Austrian stations (same as Germany, plan rows go into de_plan by station number)
async function hubEva(h) {
  if (h.eva) return h.eva;
  const xml = await tt(`station/${encodeURIComponent(h.name)}`);
  const all = [...xml.matchAll(/<station ([^>]*)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([a-z0-9]+)=['"]([^'"]*)['"]/gi)].map((x) => [x[1], x[2]])));
  const hit = all.find((s) => deNorm(s.name) === deNorm(h.name)) || all[0];
  const eva = hit?.eva || null;
  await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { eva, last_error: eva ? null : "station not found", ...(eva ? {} : { last_fchg: new Date().toISOString() }) }, { Prefer: "return=minimal" });
  return eva;
}
async function pollHub(h, now) {
  const eva = await hubEva(h);
  if (!eva) return 0;
  const hours = [0, 1, 2].map((k) => new Date(Math.floor(now / 3600000) * 3600000 + k * 3600000));
  const have = new Set((await rest("GET", `de_plan_hours?eva=eq.${eva}&hour=gte.${hours[0].toISOString()}&select=hour`)).map((r) => Date.parse(r.hour)));
  let calls = 0;
  for (const hr of hours) {
    if (have.has(hr.getTime())) continue;
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(hr);
    const g = (t) => p.find((x) => x.type === t).value;
    const xml = await tt(`plan/${eva}/${g("year")}${g("month")}${g("day")}/${g("hour")}`);
    calls++;
    const { station, stops } = parseTimetable(xml);
    const rows = stops.filter((s) => s.tl && atCategory(s.tl.c)).map((s) => ({
      eva, sid: s.sid, day: parisDate(0, new Date(ttTime(s.dp?.pt || s.ar?.pt) || hr)), cat: s.tl.c, num: s.tl.n,
      ar_pt: ttTime(s.ar?.pt), dp_pt: ttTime(s.dp?.pt), pp: s.dp?.pp || s.ar?.pp || null,
    }));
    await upsert("de_plan", rows, "eva,sid");
    await upsert("de_plan_hours", [{ eva, hour: hr.toISOString() }], "eva,hour");
    if (station && station !== h.station) { h.station = station; await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { station }, { Prefer: "return=minimal" }); }
  }
  const known = new Map((await rest("GET", `de_plan?eva=eq.${eva}&day=gte.${parisDate(-1)}&select=sid,day`)).map((r) => [r.sid, r.day]));
  const xml = await tt(`fchg/${eva}`);
  calls++;
  const ch = parseTimetable(xml).stops.filter((s) => known.has(s.sid)).map((s) => ({
    eva, sid: s.sid, day: known.get(s.sid), ar_ct: ttTime(s.ar?.ct), dp_ct: ttTime(s.dp?.ct),
    cp: s.dp?.cp || s.ar?.cp || null, cs: (s.dp?.cs || s.ar?.cs) === "c" ? "c" : null, updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < ch.length; i += 500) await upsert("de_plan", ch.slice(i, i + 500), "eva,sid");
  await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  return calls;
}

async function realtime() {
  const t0 = Date.now();
  const hubs = await rest("GET", `at_hubs?select=name,eva,station,last_fchg&order=last_fchg.asc.nullsfirst&limit=${PER_RUN}`);
  let calls = 0; const errors = [];
  for (const h of hubs) {
    try { calls += await pollHub(h, Date.now()); } catch (e) {
      errors.push(`${h.name}: ${String(e).slice(0, 120)}`);
      await rest("PATCH", `at_hubs?name=eq.${encodeURIComponent(h.name)}`, { last_fchg: new Date().toISOString(), last_error: String(e).slice(0, 200) }, { Prefer: "return=minimal" });
    }
  }
  const days = [parisDate(-1), parisDate(0)];
  const hubRows = await rest("GET", "at_hubs?select=name,eva,station&eva=not.is.null");
  const evaName = new Map(hubRows.map((h) => [h.eva, [...new Set([deNorm(h.name), deNorm(h.station || "")].filter(Boolean))]]));
  const plan = [];
  const since = new Date(Date.now() - 12 * 3600000).toISOString();
  const evas = [...evaName.keys()].join(",");
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `de_plan?eva=in.(${evas})&day=in.(${days.join(",")})&or=(dp_pt.gte.%22${since}%22,ar_pt.gte.%22${since}%22)&select=eva,cat,num,ar_pt,dp_pt,ar_ct,dp_ct,pp,cp,cs&order=eva,sid&limit=1000&offset=${off}`);
    for (const p of page) plan.push({ ...p, hubs: evaName.get(p.eva) || [] });
    if (page.length < 1000) break;
  }
  const now = Math.floor(Date.now() / 1000);
  const trains = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest("GET", `trains?country=eq.at&service_date=in.(${days.join(",")})&select=id,service_date,type,number,stops,delay_min&order=id&limit=1000&offset=${off}`);
    for (const r of page) {
      const st = r.stops || [];
      if (st.length < 2) continue;
      const a = fastEpoch(r.service_date, st[0].dep || st[0].arr), b = fastEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
      if (now >= a - 3 * 3600 && now <= b + 7200 + (r.delay_min || 0) * 60) trains.push(r);
    }
    if (page.length < 1000) break;
  }
  const updates = germanUpdates(trains, plan, now, { catOf: atCategory, keepNumbers: true });
  let written = 0;
  for (let i = 0; i < updates.length; i += 300) written += await rest("POST", "rpc/apply_at_updates", { payload: updates.slice(i, i + 300) });
  return { kind: "rt", hubs: hubs.map((h) => h.name), calls, planRows: plan.length, candidates: trains.length, written, errors, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && (await rest("POST", "rpc/cron_token_ok", { t: token }));
  if (!ok) return json({ error: "forbidden" }, 403);
  try {
    const kind = new URL(req.url).searchParams.get("kind") || "rt";
    if (kind === "rt" && (!DB_ID || !DB_KEY)) return json({ error: "DB_CLIENT_ID / DB_API_KEY not set" }, 500);
    const out = kind === "schedule" ? await schedule() : kind === "preview" ? await preview() : await realtime();
    console.log(JSON.stringify(out).slice(0, 2000));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
