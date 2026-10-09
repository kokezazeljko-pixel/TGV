// GENERISANO iz source.mjs (bun build source.mjs --target=node --format=esm --external node:* --outfile index.ts) – ne menjati ručno.
// ../../../ingest/lib/luxembourg.mjs
var LU_AGENCIES = new Set(["11"]);
var isLuxStop = (id = "") => /^000[12]\d/.test(id);
var luxNumber = (n = "") => String(n).replace(/^0+(?=\d)/, "");
var LU_API = "https://cdt.hafas.de/opendata/apiserver/";
var luxExt = (id = "") => isLuxStop(id) ? String(id).replace(/^0+/, "") : null;
var luxEpoch = (date, time) => date && time ? Math.round(Date.parse(`${date}T${time}${parisOffset(date)}`) / 1000) : null;
function parisOffset(date) {
  const d = new Date(date + "T12:00:00Z");
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(d));
  return `+0${h - 12}:00`;
}
function parseLuxBoard(body, ext) {
  const out = [];
  for (const d of body?.Departure || []) {
    const num = luxNumber(d.ProductAtStop?.num || "");
    if (!num)
      continue;
    const pt = luxEpoch(d.date, d.time);
    if (!pt)
      continue;
    let ct = luxEpoch(d.rtDate || d.date, d.rtTime);
    if (ct)
      ct += Math.round((pt - ct) / 86400) * 86400;
    out.push({
      num,
      ext: d.mainMastExtId || ext,
      pt: new Date(pt * 1000).toISOString(),
      ct: ct ? new Date(ct * 1000).toISOString() : null,
      cancelled: d.cancelled === true,
      pf: d.rtPlatform?.text || d.platform?.text || null,
      pf_plan: d.platform?.text || null
    });
  }
  return out;
}
function luxUpdates(trains, rt, toEpoch, nowSec) {
  const byKey = new Map;
  for (const r of rt)
    byKey.set(`${r.num}|${r.ext}|${Math.round(Date.parse(r.pt) / 60000)}`, r);
  const updates = [];
  for (const tr of trains) {
    if (!tr.number)
      continue;
    let carry = null, matched = 0, cancelledHits = 0, originCancelled = false;
    const d = [];
    tr.stops.forEach((s, i) => {
      const ext = luxExt(s.id);
      const t = s.dep || s.arr;
      const r = ext && t && i < tr.stops.length - 1 ? byKey.get(`${tr.number}|${ext}|${Math.round(toEpoch(tr.service_date, t) / 60)}`) : null;
      let skipped = false, apf;
      if (r) {
        matched++;
        if (r.cancelled) {
          skipped = true;
          cancelledHits++;
          if (i === 0)
            originCancelled = true;
        } else if (r.ct)
          carry = (Date.parse(r.ct) - Date.parse(r.pt)) / 1000;
        else
          carry = carry ?? 0;
        if (r.pf && r.pf_plan && r.pf !== r.pf_plan)
          apf = r.pf;
      }
      const delay = Math.max(0, Math.round((carry ?? 0) / 60));
      d.push(apf ? [delay, skipped, apf] : [delay, skipped]);
    });
    if (!matched)
      continue;
    const cancelled = cancelledHits === matched && (matched >= 2 || originCancelled);
    let delay_min = d.length ? d[d.length - 1][0] : 0;
    for (let i = 0;i < tr.stops.length; i++) {
      const s = tr.stops[i];
      if (d[i][1])
        continue;
      if (toEpoch(tr.service_date, s.arr || s.dep) + d[i][0] * 60 >= nowSec) {
        delay_min = d[i][0];
        break;
      }
    }
    updates.push({ id: tr.id, delay_min: cancelled ? 0 : delay_min, cancelled, d });
  }
  return updates;
}

// ../../../ingest/lib/util.mjs
var TZ = "Europe/Paris";
function parisDate(offsetDays = 0, now = new Date) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function tzOffsetMin(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}
function gtfsToEpoch(dateStr, hms) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, s = 0] = hms.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let off = tzOffsetMin(guess);
  off = tzOffsetMin(guess - off * 60000);
  return Math.round((guess - off * 60000) / 1000);
}

// source.mjs
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var LU_KEY = Deno.env.get("LU_API_KEY") || "";
var PER_RUN = 2;
async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok)
    throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function board(ext) {
  const q = new URLSearchParams({ accessId: LU_KEY, format: "json", lang: "fr", id: ext, duration: "90", maxJourneys: "200", products: "7" });
  const res = await fetch(`${LU_API}departureBoard?${q}`, { headers: { "Accept-Encoding": "identity" } });
  if (!res.ok)
    throw new Error(`mobiliteit.lu ${ext} -> ${res.status}`);
  return parseLuxBoard(await res.json(), ext);
}
async function realtime() {
  const t0 = Date.now();
  const days = [parisDate(-1), parisDate(0)];
  const now = Math.floor(Date.now() / 1000);
  const toEpoch = (d, t) => gtfsToEpoch(d, t);
  const trains = [];
  const all = [];
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `trains?country=eq.lu&service_date=in.(${days.join(",")})&select=id,service_date,number,stops,delay_min&order=id&limit=1000&offset=${off}`);
    all.push(...page);
    if (page.length < 1000)
      break;
  }
  for (const r of all) {
    const st = r.stops || [];
    if (st.length < 2)
      continue;
    const a = toEpoch(r.service_date, st[0].dep || st[0].arr), b = toEpoch(r.service_date, st[st.length - 1].arr || st[st.length - 1].dep);
    if (now >= a - 3600 && now <= b + 7200 + (r.delay_min || 0) * 60)
      trains.push(r);
  }
  const count = new Map;
  for (const tr of trains)
    for (const s of tr.stops) {
      const e = luxExt(s.id);
      if (e)
        count.set(e, (count.get(e) || 0) + 1);
    }
  const MAIN = "200405060";
  const others = [...count.keys()].filter((e) => e !== MAIN && count.get(e) >= 2).sort();
  const slots = Math.max(1, Math.ceil(others.length / PER_RUN)), slot = Math.floor(now / 60) % slots;
  const pick = trains.length ? [MAIN, ...others.slice(slot * PER_RUN, slot * PER_RUN + PER_RUN)] : [];
  const rows = [], errors = [];
  for (const ext of pick) {
    try {
      rows.push(...await board(ext));
    } catch (e) {
      errors.push(String(e).slice(0, 120));
    }
  }
  const stamp = new Date().toISOString();
  if (rows.length)
    await rest("POST", "lu_rt?on_conflict=num,ext,pt", rows.map((r) => ({ ...r, updated_at: stamp })), { Prefer: "resolution=merge-duplicates,return=minimal" });
  const since = new Date(Date.now() - 14 * 3600000).toISOString();
  const rt = [];
  for (let off = 0;; off += 1000) {
    const page = await rest("GET", `lu_rt?pt=gte.${encodeURIComponent(since)}&select=num,ext,pt,ct,cancelled,pf,pf_plan&order=pt,num,ext&limit=1000&offset=${off}`);
    rt.push(...page);
    if (page.length < 1000)
      break;
  }
  const updates = luxUpdates(trains, rt, toEpoch, now);
  let written = 0;
  for (let i = 0;i < updates.length; i += 300)
    written += await rest("POST", "rpc/apply_rt_delays", { payload: updates.slice(i, i + 300) });
  await rest("DELETE", `lu_rt?pt=lt.${encodeURIComponent(new Date(Date.now() - 36 * 3600000).toISOString())}`, null, { Prefer: "return=minimal" });
  return { kind: "rt", stations: pick, boardRows: rows.length, known: rt.length, candidates: trains.length, written, errors, ms: Date.now() - t0 };
}
Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  const ok = token && await rest("POST", "rpc/cron_token_ok", { t: token });
  if (!ok)
    return json({ error: "forbidden" }, 403);
  if (!LU_KEY)
    return json({ error: "LU_API_KEY not set" }, 500);
  try {
    const out = await realtime();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
