// Supabase Edge funkcija za Portugal (CP): ?kind=schedule – red vožnje (Alfa Pendular, Intercidades) za danas i sutra
// u tabelu trains, jednom dnevno. CP nema otvorene podatke uživo, pa vozovi idu po redu vožnje (kao Luksemburg).
// Zaštita: x-cron-token (Vault). Izvorni kod je ovde; za objavljivanje se spaja sa ingest/lib u index.ts (bun build).
import { inflateRawSync } from "node:zlib";
import { PT_STATIC_URL, buildPortugueseSchedule } from "../../../ingest/lib/portugal.mjs";
import { parisDate } from "../../../ingest/lib/util.mjs";

const URL_ = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const UA = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };

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

async function schedule() {
  const dates = [parisDate(0), parisDate(1)]; // Lisbon is one hour behind Paris; the days are the same for these trains
  const res = await fetch(PT_STATIC_URL, { headers: UA });
  if (!res.ok) throw new Error(`cp gtfs -> ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const rows = buildPortugueseSchedule(zip, dates, (d) => inflateRawSync(d));
  if (!rows.length) throw new Error("no trains found – nothing changed");
  for (let i = 0; i < rows.length; i += 400) await rest("POST", "trains?on_conflict=id", rows.slice(i, i + 400), { Prefer: "resolution=merge-duplicates,return=minimal" });
  const fresh = new Set(rows.map((r) => r.id));
  let removed = 0;
  for (const d of dates) {
    const old = await rest("GET", `trains?select=id&country=eq.pt&service_date=eq.${d}&limit=5000`);
    const stale = old.map((r) => r.id).filter((id) => !fresh.has(id));
    for (let i = 0; i < stale.length; i += 80) {
      await rest("DELETE", `trains?id=in.(${encodeURIComponent(stale.slice(i, i + 80).map((id) => `"${id}"`).join(","))})`, null, { Prefer: "return=minimal" });
      removed += Math.min(80, stale.length - i);
    }
  }
  await rest("DELETE", `trains?country=eq.pt&service_date=lt.${parisDate(-8)}`, null, { Prefer: "return=minimal" });
  return { kind: "schedule", trains: rows.length, removed, bytes: zip.length };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-cron-token") || "";
  if (!token || !(await rest("POST", "rpc/cron_token_ok", { t: token }))) return json({ error: "forbidden" }, 403);
  try {
    const out = await schedule();
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) {
    console.error(String(e));
    return json({ error: String(e) }, 500);
  }
});
