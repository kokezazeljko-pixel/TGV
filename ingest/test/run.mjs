// Test obe skripte na probnim podacima: node ingest/test/run.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "peron-"));
const DATE = "2026-10-03";
const now = execFileSync("python3", [join(here, "make-fixtures.py"), dir, DATE]).toString().trim().split(" ")[1];

const run = (script, extra) => console.log(execFileSync("node", [join(here, "..", script)], { env: { ...process.env, DRY_RUN: "1", ...extra } }).toString());

run("sync-schedule.mjs", { GTFS_FILE: join(dir, "gtfs.zip"), TODAY: DATE, DAYS: "1", OUT_FILE: join(dir, "trains.json") });
const trains = JSON.parse(readFileSync(join(dir, "trains.json"), "utf8"));
assert.equal(trains.length, 2, "TER i šatl moraju biti izbačeni, ostaju TGV INOUI i OUIGO");
const t1 = trains.find((t) => t.number === "6611");
assert.equal(t1.type, "TGV INOUI");
assert.equal(t1.origin, "Paris Gare de Lyon");
assert.equal(t1.stops[2].name, "Aix-en-Provence, TGV");
assert.equal(t1.dep, "11:37");
assert.equal(t1.stops[0].lat, 48.84); assert.equal(t1.stops[0].lon, 2.37);
assert.equal(t1.arr, "15:16");
const t2 = trains.find((t) => t.number === "7639");
assert.equal(t2.type, "OUIGO", "broj voza iz trip_headsign kad nema trip_short_name");

run("sync-realtime.mjs", { RT_FILE: join(dir, "feed.pb"), TRAINS_FILE: join(dir, "trains.json"), NOW: now, OUT_FILE: join(dir, "updates.json") });
const ups = JSON.parse(readFileSync(join(dir, "updates.json"), "utf8"));
const u1 = ups.find((u) => u.id.endsWith("006611F01"));
assert.deepEqual(u1.stops.map((s) => s.delay), [0, 12, 12, 19], "kašnjenja po stanicama");
assert.equal(u1.delay_min, 12, "u 14:00 sledeća stanica je Aix (+12)");
assert.equal(u1.cancelled, false);
const u2 = ups.find((u) => u.id.endsWith("007639F02"));
assert.equal(u2.cancelled, true);
assert.equal(ups.length, 2, "nepoznat voz se preskače");
// ---- Švajcarska
run("sync-schedule.mjs", { COUNTRY: "ch", GTFS_FILE: join(dir, "gtfs-ch.zip"), TODAY: DATE, DAYS: "1", OUT_FILE: join(dir, "trains-ch.json") });
const ch = JSON.parse(readFileSync(join(dir, "trains-ch.json"), "utf8"));
assert.deepEqual(ch.map((t) => t.type).sort(), ["IC", "TGV Lyria"], "samo IC i TGV, bez S-Bahna, RE i autobusa");
assert.ok(!ch.some((t) => t.number === "6805"), "francuski TGV bez švajcarske stanice (Lyon–Nica) se izbacuje");
const ic = ch.find((t) => t.number === "717");
assert.equal(ic.country, "ch");
assert.ok(ic.id.includes("_ch_"), "id sa oznakom zemlje");
assert.equal(ic.origin, "Genève"); assert.equal(ic.destination, "St. Gallen");
assert.equal(ic.dep, "10:02"); assert.equal(ic.arr, "13:58");
assert.equal(ic.stops[3].lat, 47.3781);
run("sync-realtime.mjs", { COUNTRY: "ch", RT_FILE: join(dir, "feed-ch.pb"), TRAINS_FILE: join(dir, "trains-ch.json"), NOW: now, OUT_FILE: join(dir, "updates-ch.json") });
const upch = JSON.parse(readFileSync(join(dir, "updates-ch.json"), "utf8"));
assert.equal(upch.length, 1, "S-Bahn iz feeda se preskače");
assert.deepEqual(upch[0].stops.map((s) => s.delay), [0, 0, 4, 4, 4], "kašnjenje od Berna dalje");

// Zvanična obaveštenja (Service Alerts)
{
  const { decodeFeed } = await import("../lib/gtfs-rt.mjs");
  const { alertRows, alertStats } = await import("../lib/alerts.mjs");
  const feedA = decodeFeed(readFileSync(join(dir, "alerts.pb")));
  assert.deepEqual(alertStats(feedA), { alerts: 3, withTrip: 2, withRoute: 1, withStop: 0 });
  const rowsA = alertRows(feedA, "fr", Number(now));
  assert.equal(rowsA.length, 1, "samo aktuelno obaveštenje vezano za voz");
  assert.equal(rowsA[0].header, "Train retardé");
  assert.equal(rowsA[0].description, "Panne de signalisation à Mâcon");
  assert.deepEqual(rowsA[0].trip_ids, ["OCESN006611F01"]);
}
console.log("✔ Svi testovi su prošli");
