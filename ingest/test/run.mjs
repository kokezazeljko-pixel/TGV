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
  assert.equal(rowsA[0].orig_lang, "fr", "SNCF obaveštenje je na francuskom");
  assert.deepEqual(rowsA[0].header_tr, { fr: "Train retardé", en: "Train retardé (en)" }, "čuvaju se svi jezici iz feeda");
}
// ---- Belgija
run("sync-schedule.mjs", { COUNTRY: "be", GTFS_FILE: join(dir, "gtfs-be.zip"), TODAY: DATE, DAYS: "1", OUT_FILE: join(dir, "trains-be.json") });
const be = JSON.parse(readFileSync(join(dir, "trains-be.json"), "utf8"));
assert.deepEqual(be.map((t) => t.number).sort(), ["1530", "2017", "2021", "9233"], "IC i EC sa belgijskom stanicom; bez L, autobusa i EC samo kroz Holandiju");
const b1 = be.find((t) => t.number === "2017");
assert.equal(b1.country, "be"); assert.equal(b1.type, "IC");
assert.ok(b1.id.includes("_be_88____:007::8821006"), "kraći id bez gt:nmbssncb:");
assert.equal(b1.origin, "Antwerpen-Centraal", "Flandrija: holandski naziv");
assert.equal(b1.stops[1].name, "Bruxelles-Midi / Brussel-Zuid", "Brisel: oba jezika");
assert.equal(b1.destination, "Namur", "Valonija: francuski naziv");
assert.equal(be.find((t) => t.number === "1530").destination, "Leuven");
assert.equal(be.find((t) => t.number === "9233").type, "EC");
run("sync-realtime.mjs", { COUNTRY: "be", RT_FILE: join(dir, "feed-be.json"), TRAINS_FILE: join(dir, "trains-be.json"), NOW: now, OUT_FILE: join(dir, "updates-be.json") });
const upbe = JSON.parse(readFileSync(join(dir, "updates-be.json"), "utf8"));
const ub1 = upbe.find((u) => u.id === b1.id);
assert.deepEqual(ub1.stops.map((s) => s.delay), [0, 5, 5], "kašnjenje od Brisela (po rednom broju, i kad se peron promeni)");
assert.equal(ub1.delay_min, 5);
const ub2 = upbe.find((u) => u.id.endsWith(":1330:20260101:1"));
assert.ok(ub2 && ub2.delay_min === 0, "voz koji vozi a nema ga u feedu je tačan");
assert.equal(upbe.length, 2, "voz koji još nije krenuo (16:00) i EC u 15:00 se ne diraju");
{
  const { feedFromJson, belgianAlertRows } = await import("../lib/belgium.mjs");
  const fb = feedFromJson(JSON.parse(readFileSync(join(dir, "alerts-be.json"), "utf8")));
  const rb = belgianAlertRows(fb, Number(now));
  assert.equal(rb.length, 1, "isteklo obaveštenje se preskače");
  assert.deepEqual(rb[0].stations.sort(), ["hoei", "huy", "namen", "namur"]);
  assert.equal(rb[0].need, 2, "dve stanice u naslovu -> voz mora da staje na obe");
  assert.equal(rb[0].header_tr.nl, "Namen - Hoei: Geen treinen");
  assert.equal(rb[0].header, "Namur - Huy : Aucun train");
  assert.equal(rb[0].id, "h" + rb[0].id.slice(1), "stalni id");
  const again = belgianAlertRows(feedFromJson(JSON.parse(readFileSync(join(dir, "alerts-be.json"), "utf8").replace("rs:nmbssncb:a1", "rs:nmbssncb:zz9"))), Number(now));
  assert.equal(again[0].id, rb[0].id, "isto obaveštenje pod novim SNCB brojem dobija isti id");
  const { stableId } = await import("../lib/belgium.mjs");
  assert.equal(stableId({ url: [{ lang: "fr", text: "http://www.belgianrail.be/jp/nmbs-realtime/help.exe/fr?tpl=x&messageID=113828&channelFilter=y" }] }), "msg113828");
  const { worksDays } = await import("../lib/belgium.mjs");
  assert.deepEqual(worksDays("During the weekend of 10-11/10 Infrabel is working", "2026-10-04"), ["2026-10-10", "2026-10-11"]);
  assert.deepEqual(worksDays("weekends of 3-4, 17-18 and 24-25/10", "2026-10-04"), ["2026-10-03", "2026-10-04", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25"]);
  assert.equal(worksDays("Every day, from 31/10 to 6/11", "2026-10-04").length, 7);
  assert.ok(!worksDays("On weekdays from 12 to 22/10", "2026-10-04").includes("2026-10-17"), "radni dani bez vikenda");
  assert.equal(worksDays("Pas de date", "2026-10-04"), null);
  // radovi bez datuma u feedu: prikazuju se samo dana koji piše u tekstu
  const works = (id, en) => ({ id, alert: { activePeriods: [], informed: [], cause: 10, header: [{ lang: "fr", text: "Mons - Soignies" }], description: [{ lang: "en", text: en }] } });
  const today = new Date(Number(now) * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const [y, m, d] = today.split("-").map(Number);
  const rw = belgianAlertRows({ entities: [works("w1", `Works on ${d}/${m}.`), works("w2", "Works on 1/1 and 2/1."), works("w3", "Works.")] }, Number(now), today);
  assert.deepEqual(rw.map((r) => r.description_tr.en), [`Works on ${d}/${m}.`], "samo radovi danas/sutra; bez datuma se ne prikazuju");
}
console.log("✔ Svi testovi su prošli");
