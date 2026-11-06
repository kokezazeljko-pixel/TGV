// Backup live source for Dutch trains: NS Reisinformatie API (key in Edge Functions secret NS_API_KEY).
// Fills only trains OVapi has not updated in the last 10 minutes (ns_candidates / apply_ns_delays).
// 1) departures of 47 main stations give the delay of most running trains;
// 2) the journey of a single train (all its stops) for trains not seen there, cancellations and trains near the end.
// NS allows 300 requests per 5 minutes; one run uses at most 47 + JOURNEY_MAX. Run every 5 minutes.
// Auth: custom x-cron-token header checked against a Vault secret (verify_jwt is off on purpose).
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, NS = Deno.env.get("NS_API_KEY") || "";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const NSB = "https://gateway.apiportal.ns.nl/reisinformatie-api/api";
const STATIONS = ["ASD","ASS","ASB","UT","RTD","GVC","HT","EHV","AMF","ZL","AH","NM","SHL","LEDN","HLM","ZD","AMR","HN","LW","GN","ASN","MP","DV","APD","HGL","ES","AML","ZP","ED","TB","BD","RSD","VS","MT","STD","RM","VL","DDR","GD","DT","LLS","ALM","HVS","WD","GDM","O","HRL"];
const JOURNEY_MAX = 190, PARALLEL = 6;
const PLATFORM = /^(\d{1,3}[A-Z]{0,2}|[A-Z]\d{0,2})$/;

async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw Error(`${fn} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// local Dutch time "HH:MM:SS" of a service day -> epoch seconds (handles 24:xx and summer/winter time)
function tzOff(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60000);
}
function epoch(date: string, hms: string) {
  const [y, m, d] = date.split("-").map(Number), [h, mi, s = 0] = hms.split(":").map(Number);
  const g = Date.UTC(y, m - 1, d, h, mi, s); let off = tzOff(g); off = tzOff(g - off * 60000);
  return Math.round((g - off * 60000) / 1000);
}
const nsEpoch = (t?: string) => { const v = t ? Date.parse(t.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN; return isNaN(v) ? null : Math.round(v / 1000); };
const platform = (t?: string) => { const c = String(t || "").trim().toUpperCase().replace(/\s+/g, ""); return c && PLATFORM.test(c) ? c : null; };

type Stop = { seq: number; arr: string | null; dep: string | null; pf: string | null; st: string | null; delay: number | null };
type Cand = { id: string; number: string; service_date: string; delay_min: number | null; stops: Stop[] };
type Info = { sec: number | null; skipped: boolean; track: string | null };

Deno.serve(async (req) => {
  const tok = req.headers.get("x-cron-token") || "";
  if (!tok || (await rpc("cron_token_ok", { t: tok })) !== true) return json({ error: "forbidden" }, 403);
  if (!NS) return json({ error: "NS_API_KEY is not set (Edge Functions → Secrets)" }, 500);
  const t0 = Date.now(), out: any = { candidates: 0, depCalls: 0, journeyCalls: 0, seenDep: 0, journeyOk: 0, updates: 0, written: 0 };
  let limited = false;
  const nsGet = async (path: string) => {
    if (limited) return null;
    const r = await fetch(`${NSB}${path}`, { headers: { "Ocp-Apim-Subscription-Key": NS } });
    if (r.status === 429) { limited = true; out.rateLimited = true; return null; }
    if (!r.ok) { out.errors = (out.errors || 0) + 1; await r.body?.cancel(); return null; }
    return r.json();
  };
  try {
    const raw = (await rpc("ns_candidates", {})) as any[];
    const cands: Cand[] = raw.map((r) => ({ ...r, stops: (r.stops || []).map(([seq, arr, dep, pf, st, delay]: any[]) => ({ seq, arr, dep, pf, st, delay })) }));
    out.candidates = cands.length;
    if (!cands.length) return json(out);
    const now = Math.floor(Date.now() / 1000);
    const sched = (c: Cand, s: Stop) => epoch(c.service_date, (s.arr || s.dep)!);
    const schedDep = (c: Cand, s: Stop) => epoch(c.service_date, (s.dep || s.arr)!);
    const byNum = new Map<string, Cand[]>();
    for (const c of cands) { if (!byNum.has(c.number)) byNum.set(c.number, []); byNum.get(c.number)!.push(c); }
    const info = new Map<string, Map<number, Info>>(), cancelSeen = new Set<string>();

    // 1) departure boards
    for (const st of STATIONS) {
      const j = await nsGet(`/v2/departures?station=${st}&maxJourneys=40`); out.depCalls++;
      if (!j) { if (limited) break; continue; }
      const code = st.toLowerCase();
      for (const d of j?.payload?.departures || []) {
        if (d?.product?.type && d.product.type !== "TRAIN") continue;
        const list = byNum.get(String(d?.product?.number || "")); if (!list) continue;
        const planned = nsEpoch(d.plannedDateTime); if (planned == null) continue;
        let best: { c: Cand; i: number; diff: number } | null = null;
        for (const c of list) c.stops.forEach((s, i) => {
          if (s.st !== code || !(s.dep || s.arr)) return;
          const diff = Math.abs(schedDep(c, s) - planned);
          if (diff < 3 * 3600 && (!best || diff < best.diff)) best = { c, i, diff };
        });
        if (!best) continue;
        const { c, i } = best as { c: Cand; i: number };
        const actual = nsEpoch(d.actualDateTime);
        const track = d.actualTrack && d.actualTrack !== d.plannedTrack ? platform(d.actualTrack) : null;
        if (!info.has(c.id)) info.set(c.id, new Map());
        info.get(c.id)!.set(i, { sec: actual != null ? actual - planned : null, skipped: !!d.cancelled, track });
        if (d.cancelled) cancelSeen.add(c.id);
      }
    }
    out.seenDep = info.size;

    // 2) single-train journeys: cancellations first, then trains near/after the end, then trains not seen
    const lastDelay = (c: Cand) => { const m = info.get(c.id); let v = c.delay_min || 0; if (m) for (const x of m.values()) if (x.sec != null) v = Math.max(0, Math.round(x.sec / 60)); return v; };
    const pri = (c: Cand) => {
      const last = c.stops[c.stops.length - 1]; if (!last || !(last.arr || last.dep)) return 0;
      const end = sched(c, last) + lastDelay(c) * 60;
      if (cancelSeen.has(c.id)) return 3;
      if (now > end + 20 * 60) return info.has(c.id) ? 0 : 1;
      if (now > end - 15 * 60) return 2;
      return info.has(c.id) ? 0 : 1;
    };
    const queue = cands.map((c) => ({ c, p: pri(c) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, JOURNEY_MAX).map((x) => x.c);
    out.journeyQueued = queue.length;
    const one = async (c: Cand) => {
      const j = await nsGet(`/v2/journey?train=${c.number}`); out.journeyCalls++;
      const stops = j?.payload?.stops; if (!Array.isArray(stops)) return;
      const m = new Map<number, Info>(); let from = 0, close = false;
      for (const s of stops) {
        if (s.status === "PASSING") continue;
        const code = String(s.id || "").split("_")[0].toLowerCase(); if (!code) continue;
        const i = c.stops.findIndex((x, k) => k >= from && x.st === code); if (i < 0) continue;
        from = i + 1;
        const a = s.arrivals?.[0], d = s.departures?.[0], our = c.stops[i];
        const ev = our.arr && a ? a : d || a; if (!ev) continue;
        const planned = nsEpoch(ev.plannedTime), actual = nsEpoch(ev.actualTime);
        if (planned != null && Math.abs((ev === a ? sched(c, our) : schedDep(c, our)) - planned) < 3 * 3600) close = true;
        const sec = typeof ev.delayInSeconds === "number" ? ev.delayInSeconds : planned != null && actual != null ? actual - planned : null;
        const skipped = (a ? !!a.cancelled : true) && (d ? !!d.cancelled : true);
        const tr = (d || a); const track = tr?.actualTrack && tr.actualTrack !== tr.plannedTrack ? platform(tr.actualTrack) : null;
        m.set(i, { sec, skipped, track });
      }
      if (close && m.size) { info.set(c.id, m); out.journeyOk++; } // ignore a journey of another day
    };
    for (let k = 0; k < queue.length && !limited; k += PARALLEL) await Promise.all(queue.slice(k, k + PARALLEL).map(one));

    // 3) delays per stop (carried forward like the GTFS-RT feeds) and the current delay
    const updates: any[] = [];
    for (const c of cands) {
      const m = info.get(c.id); if (!m || !m.size) continue;
      const first = Math.min(...m.keys());
      let carry: number | null = null;
      const rows = c.stops.map((s, i) => {
        const x = m.get(i);
        if (i < first) return { delay: Math.max(0, s.delay || 0), skipped: false, track: null as string | null };
        if (x?.sec != null) carry = x.sec;
        const track = x?.track && x.track !== String(s.pf || "").toUpperCase() ? x.track : null;
        return { delay: Math.max(0, Math.round((carry ?? 0) / 60)), skipped: !!x?.skipped, track };
      });
      const cancelled = rows.length > 0 && rows.every((r) => r.skipped);
      let delay = rows.length ? rows[rows.length - 1].delay : 0;
      for (let i = 0; i < rows.length; i++) {
        const s = c.stops[i]; if (rows[i].skipped || !(s.arr || s.dep)) continue;
        if (sched(c, s) + rows[i].delay * 60 >= now) { delay = rows[i].delay; break; }
      }
      updates.push({ id: c.id, delay_min: cancelled ? 0 : delay, cancelled, d: rows.map((r) => (r.track ? [r.delay, r.skipped, r.track] : [r.delay, r.skipped])) });
    }
    out.updates = updates.length;
    if (new URL(req.url).searchParams.get("dry") === "1") { // measuring only: nothing is written
      out.dry = true; out.ms = Date.now() - t0;
      out.sample = updates.filter((u) => u.delay_min > 0 || u.cancelled).slice(0, 5).concat(updates.slice(0, 2));
      out.late = updates.filter((u) => u.delay_min >= 5).length; out.cancelled = updates.filter((u) => u.cancelled).length;
      return json(out);
    }
    for (let i = 0; i < updates.length; i += 400) out.written += await rpc("apply_ns_delays", { payload: updates.slice(i, i + 400) });
    out.ms = Date.now() - t0;
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ ...out, error: String(e) }, 500);
  }
});
