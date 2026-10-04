"""Pravi probne podatke (mali GTFS zip i GTFS-RT feed) za testiranje skripti bez interneta.
Pokretanje: python3 ingest/test/make-fixtures.py <izlazni-folder> <datum YYYY-MM-DD>
"""
import sys, zipfile, os, datetime, zoneinfo

out, date = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
ymd = date.replace("-", "")

files = {
"agency.txt": "agency_id,agency_name,agency_url,agency_timezone\nOCESN,SNCF,https://www.sncf.com,Europe/Paris\n",
"routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,OCESN,,Paris - Marseille,2\nR2,OCESN,,Marne-la-Vallée - Montpellier,2\nR3,OCESN,,Lyon - Grenoble,2\n",
"calendar_dates.txt": f"service_id,date,exception_type\nS1,{ymd},1\nS2,{ymd},1\nS3,{ymd},1\nS4,{ymd},1\n",
"trips.txt": "route_id,service_id,trip_id,trip_headsign,trip_short_name\n"
             "R1,S1,OCESN006611F01,6611,6611\n"
             "R2,S2,OCESN007639F02,7639,\n"
             "R3,S3,OCESN017501F03,17501,17501\n"
             "R1,S4,OCESN879303F04,879303,879303\n",
"stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n"
             "StopPoint:OCETGV INOUI-87686006,Paris Gare de Lyon,48.84,2.37\n"
             "StopPoint:OCETGV INOUI-87723197,Lyon Part-Dieu,45.76,4.86\n"
             "StopPoint:OCETGV INOUI-87319012,\"Aix-en-Provence, TGV\",43.45,5.31\n"
             "StopPoint:OCETGV INOUI-87751008,Marseille Saint-Charles,43.30,5.38\n"
             "StopPoint:OCEOUIGO-87111849,Marne-la-Vallée Chessy,48.87,2.78\n"
             "StopPoint:OCEOUIGO-87773002,Montpellier Saint-Roch,43.60,3.88\n"
             "StopPoint:OCETrain TER-87723197,Lyon Part-Dieu,45.76,4.86\n"
             "StopPoint:OCETrain TER-87747006,Grenoble,45.19,5.71\n",
"stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
             "OCESN006611F01,11:37:00,11:37:00,StopPoint:OCETGV INOUI-87686006,0\n"
             "OCESN006611F01,13:34:00,13:38:00,StopPoint:OCETGV INOUI-87723197,1\n"
             "OCESN006611F01,15:01:00,15:03:00,StopPoint:OCETGV INOUI-87319012,2\n"
             "OCESN006611F01,15:16:00,15:16:00,StopPoint:OCETGV INOUI-87751008,3\n"
             "OCESN007639F02,13:04:00,13:04:00,StopPoint:OCEOUIGO-87111849,0\n"
             "OCESN007639F02,16:42:00,16:42:00,StopPoint:OCEOUIGO-87773002,1\n"
             "OCESN017501F03,10:00:00,10:00:00,StopPoint:OCETrain TER-87723197,0\n"
             "OCESN017501F03,11:20:00,11:20:00,StopPoint:OCETrain TER-87747006,1\n"
             "OCESN879303F04,12:00:00,12:00:00,StopPoint:OCETGV INOUI-87751008,0\n"
             "OCESN879303F04,12:05:00,12:05:00,StopPoint:OCETGV INOUI-87319012,1\n",
}
with zipfile.ZipFile(os.path.join(out, "gtfs.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for k, v in files.items():
        z.writestr(k, ("﻿" if k == "stops.txt" else "") + v)

# ---- GTFS-RT (ručno kodiran protobuf)
def varint(n):
    if n < 0: n += 1 << 64
    b = bytearray()
    while True:
        x = n & 0x7F; n >>= 7
        if n: b.append(x | 0x80)
        else: b.append(x); return bytes(b)
def key(f, w): return varint((f << 3) | w)
def ld(f, data): return key(f, 2) + varint(len(data)) + data
def vi(f, n): return key(f, 0) + varint(n)
def s(f, txt): return ld(f, txt.encode())

tz = zoneinfo.ZoneInfo("Europe/Paris")
def epoch(hm):
    h, m = map(int, hm.split(":"))
    d = datetime.datetime.strptime(date, "%Y-%m-%d").replace(hour=h, minute=m, tzinfo=tz)
    return int(d.timestamp())

def stu(seq, arrival=None, departure=None, rel=None):
    b = vi(1, seq)
    if arrival: b += ld(2, arrival)
    if departure: b += ld(3, departure)
    if rel is not None: b += vi(5, rel)
    return b

# 6611: kasni 12 min u Lyonu, Aix bez podatka (prenosi se), Marseille po vremenu: 15:16 + 19 min
tu1 = ld(1, s(1, "OCESN006611F01") + s(3, ymd)) \
    + ld(2, stu(0, departure=vi(1, -60))) \
    + ld(2, stu(1, arrival=vi(1, 720))) \
    + ld(2, stu(3, arrival=vi(2, epoch("15:35"))))
# 7639: otkazan
tu2 = ld(1, s(1, "OCESN007639F02") + s(3, ymd) + vi(4, 3))
# nepoznat voz
tu3 = ld(1, s(1, "NEPOZNAT") + s(3, ymd)) + ld(2, stu(0, arrival=vi(1, 300)))

feed = ld(1, s(1, "2.0") + vi(3, epoch("14:00"))) \
     + ld(2, s(1, "e1") + ld(3, tu1)) \
     + ld(2, s(1, "e2") + ld(3, tu2)) \
     + ld(2, s(1, "e3") + ld(3, tu3))
open(os.path.join(out, "feed.pb"), "wb").write(feed)
print("now", epoch("14:00"))

# ---- Švajcarska: mali GTFS u švajcarskom stilu (route_desc = kategorija, calendar.txt, SLOID stop_id)
wd = datetime.datetime.strptime(date, "%Y-%m-%d").weekday()  # 0 = ponedeljak
days = ["0"] * 7; days[wd] = "1"
ch = {
"routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"
              "91-1-j26-1,11,IC1,,IC,102\n91-8-j26-1,11,S8,,S,109\n91-RE-j26-1,11,RE,,RE,106\n92-B-j26-1,801,31,,B,700\n91-TGV-j26-1,1183,TGV,,TGV,101\n",
"calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                f"TA,{','.join(days)},{date.replace('-','')[:4]}0101,{date.replace('-','')[:4]}1231\n",
"trips.txt": "route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id\n"
             "91-1-j26-1,TA,1.TA.91-1-j26-1.1.H,St. Gallen,717,0\n"
             "91-8-j26-1,TA,2.TA.91-8-j26-1.1.H,Pfäffikon SZ,18837,0\n"
             "91-RE-j26-1,TA,3.TA.91-RE-j26-1.1.H,Bern,4021,0\n"
             "92-B-j26-1,TA,4.TA.92-B-j26-1.1.H,Bahnhof,31,0\n"
             "91-TGV-j26-1,TA,5.TA.91-TGV-j26-1.1.R,Paris Gare de Lyon,9774,1\n"
             "91-TGV-j26-1,TA,6.TA.91-TGV-j26-1.1.H,Nice-Ville,6805,0\n",
"stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n"
             "ch:1:sloid:7000:4:7,Genève,46.2102,6.1424,,Parent8501008\n"
             "ch:1:sloid:5003:2:3,Lausanne,46.5168,6.6291,,Parent8501120\n"
             "ch:1:sloid:7000:1:1,Bern,46.9488,7.4393,,Parent8507000\n"
             "ch:1:sloid:3000:31:31,Zürich HB,47.3781,8.5402,,Parent8503000\n"
             "ch:1:sloid:3000:9:9,Zürich HB,47.3779,8.5400,,Parent8503000\n"
             "ch:1:sloid:6021:1:1,St. Gallen,47.4232,9.3697,,Parent8506302\n"
             "8014228_gen:missingSLOID_pf:12,Thalwil,47.2954,8.5646,,\n"
             "8772319,Lyon Part Dieu,45.7606,4.8593,,\n"
             "8775605,Nice-Ville,43.7046,7.2619,,\n",
"stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
             "1.TA.91-1-j26-1.1.H,,10:02:00,ch:1:sloid:7000:4:7,1\n"
             "1.TA.91-1-j26-1.1.H,10:38:00,10:41:00,ch:1:sloid:5003:2:3,2\n"
             "1.TA.91-1-j26-1.1.H,11:46:00,11:50:00,ch:1:sloid:7000:1:1,3\n"
             "1.TA.91-1-j26-1.1.H,12:46:00,12:50:00,ch:1:sloid:3000:31:31,4\n"
             "1.TA.91-1-j26-1.1.H,13:58:00,,ch:1:sloid:6021:1:1,5\n"
             "2.TA.91-8-j26-1.1.H,,10:05:00,ch:1:sloid:3000:9:9,1\n"
             "2.TA.91-8-j26-1.1.H,10:20:00,,8014228_gen:missingSLOID_pf:12,2\n"
             "3.TA.91-RE-j26-1.1.H,,10:00:00,ch:1:sloid:5003:2:3,1\n"
             "3.TA.91-RE-j26-1.1.H,11:10:00,,ch:1:sloid:7000:1:1,2\n"
             "4.TA.92-B-j26-1.1.H,,10:00:00,ch:1:sloid:3000:9:9,1\n"
             "4.TA.92-B-j26-1.1.H,10:10:00,,ch:1:sloid:3000:31:31,2\n"
             "5.TA.91-TGV-j26-1.1.R,,12:30:00,ch:1:sloid:5003:2:3,1\n"
             "5.TA.91-TGV-j26-1.1.R,16:15:00,,ch:1:sloid:7000:4:7,2\n"
             "6.TA.91-TGV-j26-1.1.H,,08:06:00,8772319,1\n"
             "6.TA.91-TGV-j26-1.1.H,13:04:00,,8775605,2\n",
}
with zipfile.ZipFile(os.path.join(out, "gtfs-ch.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for k, v in ch.items(): z.writestr(k, v)
# IC 717 kasni 4 min od Berna (vreme 11:50 + 4), feed sa start_date
tuch = ld(1, s(1, "1.TA.91-1-j26-1.1.H") + s(3, ymd)) + ld(2, stu(3, departure=vi(1, 240)))
feedch = ld(1, s(1, "2.0") + vi(3, epoch("12:00"))) + ld(2, s(1, "c1") + ld(3, tuch)) \
       + ld(2, s(1, "c2") + ld(3, ld(1, s(1, "2.TA.91-8-j26-1.1.H") + s(3, ymd)) + ld(2, stu(1, departure=vi(1, 60)))))
open(os.path.join(out, "feed-ch.pb"), "wb").write(feedch)

# ---- Service Alerts (zvanična obaveštenja): jedno za voz 6611, jedno samo za liniju, jedno isteklo
def tr(text, lang): return ld(1, s(1, text) + s(2, lang))
def alert(eid, trip=None, route=None, start=None, end=None, header="", desc=""):
    a = b""
    if start or end: a += ld(1, (vi(1, start) if start else b"") + (vi(2, end) if end else b""))
    if trip: a += ld(5, ld(4, s(1, trip)))
    if route: a += ld(5, s(2, route))
    a += vi(6, 9) + vi(7, 3) + ld(10, tr(header, "fr") + tr(header + " (en)", "en")) + ld(11, tr(desc, "fr"))
    return ld(2, s(1, eid) + ld(5, a))
fa = ld(1, s(1, "2.0") + vi(3, epoch("14:00"))) \
   + alert("A1", trip="OCESN006611F01", start=epoch("10:00"), end=epoch("23:00"), header="Train retardé", desc="Panne de signalisation à Mâcon") \
   + alert("A2", route="R1", header="Travaux", desc="Ligne modifiée") \
   + alert("A3", trip="OCESN006611F01", start=epoch("06:00"), end=epoch("07:00"), header="Ancien", desc="Fini")
open(os.path.join(out, "alerts.pb"), "wb").write(fa)

# ---- Belgija (SNCB): GTFS kao u pravom feedu (gt:/gs:/gr: oznake, francuski nazivi + translations.txt),
# GTFS-RT kao JSON sa samo vozovima koji kasne, obaveštenja vezana samo za mrežu
P = "gs:nmbssncb:"
be = {
"agency.txt": "agency_id,agency_name,agency_url,agency_timezone,agency_lang\nnmbssncb,NMBS/SNCB,http://www.belgiantrain.be/,Europe/Brussels,fr\n",
"routes.txt": "agency_id,route_color,route_desc,route_id,route_long_name,route_short_name,route_text_color,route_type,route_url\n"
              "nmbssncb,,,gr:nmbssncb:1,Anvers-Central -- Namur,IC,,2,\n"
              "nmbssncb,,,gr:nmbssncb:2,Genk -- Louvain,L,,2,\n"
              "nmbssncb,,,gr:nmbssncb:3,Mons -- Soignies,BUS,,3,\n"
              "nmbssncb,,,gr:nmbssncb:4,Rotterdam Centraal (NL) -- Bruxelles-Midi,EC,,2,\n",
"calendar_dates.txt": f"date,exception_type,service_id\n{ymd},1,gc:nmbssncb:1\n",
"trips.txt": "route_id,service_id,trip_headsign,trip_id,trip_short_name\n"
             "gr:nmbssncb:1,gc:nmbssncb:1,Namur,gt:nmbssncb:88____:007::8821006:8863008:3:1300:20260101,2017\n"
             "gr:nmbssncb:1,gc:nmbssncb:1,Louvain,gt:nmbssncb:88____:007::8841004:8833001:2:1330:20260101:1,1530\n"
             "gr:nmbssncb:1,gc:nmbssncb:1,Namur,gt:nmbssncb:88____:007::8821006:8863008:3:1600:20260101,2021\n"
             "gr:nmbssncb:2,gc:nmbssncb:1,Louvain,gt:nmbssncb:88____:007::8831807:8833001:2:1300:20260101,4123\n"
             "gr:nmbssncb:3,gc:nmbssncb:1,Soignies,gt:nmbssncb:88____:007::8881000:8881166:2:1300:20260101,9001\n"
             "gr:nmbssncb:4,gc:nmbssncb:1,Rotterdam Centraal (NL),gt:nmbssncb:88____:098::8814001:8400530:2:1500:20260101,9233\n"
             "gr:nmbssncb:4,gc:nmbssncb:1,Rotterdam Centraal (NL),gt:nmbssncb:88____:098::8400131:8400530:2:1500:20260101,9235\n",
"stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code\n"
             f"{P}8821006_3,Anvers-Central,51.2172,4.4211,0,{P}S8821006,3\n"
             f"{P}8814001_14,Bruxelles-Midi,50.8357,4.3363,0,{P}S8814001,14\n"
             f"{P}8863008_2,Namur,50.4686,4.8623,0,{P}S8863008,2\n"
             f"{P}8841004_4,Liège-Guillemins,50.6244,5.5667,0,{P}S8841004,4\n"
             f"{P}8833001_7,Louvain,50.8812,4.7160,0,{P}S8833001,7\n"
             f"{P}8831807_1,Genk,50.9677,5.4999,0,{P}S8831807,1\n"
             f"{P}8881000_BUS,Mons,50.4537,3.9425,0,{P}S8881000,BUS\n"
             f"{P}8881166_BUS,Soignies,50.5790,4.0700,0,{P}S8881166,BUS\n"
             f"{P}8400530,Rotterdam Centraal (NL),51.9250,4.4690,0,,\n"
             f"{P}8400131,Breda (NL),51.5955,4.7801,0,,\n",
"stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1300:20260101,13:00:00,13:00:00,{P}8821006_3,1\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1300:20260101,13:45:00,13:50:00,{P}8814001_14,2\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1300:20260101,14:40:00,14:40:00,{P}8863008_2,3\n"
             f"gt:nmbssncb:88____:007::8841004:8833001:2:1330:20260101:1,13:30:00,13:30:00,{P}8841004_4,1\n"
             f"gt:nmbssncb:88____:007::8841004:8833001:2:1330:20260101:1,14:20:00,14:20:00,{P}8833001_7,2\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1600:20260101,16:00:00,16:00:00,{P}8821006_3,1\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1600:20260101,16:45:00,16:50:00,{P}8814001_14,2\n"
             f"gt:nmbssncb:88____:007::8821006:8863008:3:1600:20260101,17:40:00,17:40:00,{P}8863008_2,3\n"
             f"gt:nmbssncb:88____:007::8831807:8833001:2:1300:20260101,13:00:00,13:00:00,{P}8831807_1,1\n"
             f"gt:nmbssncb:88____:007::8831807:8833001:2:1300:20260101,14:00:00,14:00:00,{P}8833001_7,2\n"
             f"gt:nmbssncb:88____:007::8881000:8881166:2:1300:20260101,13:00:00,13:00:00,{P}8881000_BUS,1\n"
             f"gt:nmbssncb:88____:007::8881000:8881166:2:1300:20260101,13:30:00,13:30:00,{P}8881166_BUS,2\n"
             f"gt:nmbssncb:88____:098::8814001:8400530:2:1500:20260101,15:00:00,15:00:00,{P}8814001_14,1\n"
             f"gt:nmbssncb:88____:098::8814001:8400530:2:1500:20260101,16:10:00,16:10:00,{P}8400530,2\n"
             f"gt:nmbssncb:88____:098::8400131:8400530:2:1500:20260101,15:00:00,15:00:00,{P}8400131,1\n"
             f"gt:nmbssncb:88____:098::8400131:8400530:2:1500:20260101,15:40:00,15:40:00,{P}8400530,2\n",
"translations.txt": "table_name,field_name,record_id,record_sub_id,field_value,language,translation\n"
             "stops,stop_name,,,Anvers-Central,nl,Antwerpen-Centraal\n"
             "stops,stop_name,,,Anvers-Central,en,Anvers-Central / Antwerpen-Centraal\n"
             "stops,stop_name,,,Bruxelles-Midi,nl,Brussel-Zuid\n"
             "stops,stop_name,,,Namur,nl,Namen\n"
             "stops,stop_name,,,Liège-Guillemins,nl,Luik-Guillemins\n"
             "stops,stop_name,,,Louvain,nl,Leuven\n",
}
with zipfile.ZipFile(os.path.join(out, "gtfs-be.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for k, v in be.items(): z.writestr(k, v)
import json
# IC 2017 kasni 5 min od Brisela; IC 1530 vozi tačno (nema ga u feedu); nepoznat voz se preskače
feedbe = {"header": {"gtfsRealtimeVersion": "1.0", "incrementality": 0, "timestamp": epoch("14:00")}, "entity": [
  {"id": "rt:x1", "tripUpdate": {"trip": {"tripId": "gt:nmbssncb:88____:007::8821006:8863008:3:1300:20260101", "startTime": "13:00:00", "startDate": ymd, "scheduleRelationship": 0},
    "stopTimeUpdate": [{"departure": {"time": epoch("13:00"), "delay": 0}, "stopId": P + "8821006_3", "scheduleRelationship": 0, "stopSequence": 1},
                       {"arrival": {"time": epoch("13:50"), "delay": 300}, "departure": {"time": epoch("13:55"), "delay": 300}, "stopId": P + "8814001_12", "scheduleRelationship": 0, "stopSequence": 2}]}},
  {"id": "rt:x2", "tripUpdate": {"trip": {"tripId": "gt:nmbssncb:NEPOZNAT", "startDate": ymd}, "stopTimeUpdate": []}}]}
open(os.path.join(out, "feed-be.json"), "w").write(json.dumps(feedbe))
def trs(**kw): return {"translation": [{"language": k, "text": v} for k, v in kw.items()]}
alertsbe = {"header": {"gtfsRealtimeVersion": "2.0"}, "entity": [
  {"id": "rs:nmbssncb:a1", "alert": {"informedEntity": [{"agencyId": "nmbssncb"}], "activePeriod": [], "cause": 1, "effect": 8,
    "headerText": trs(fr="Namur - Huy : Aucun train", nl="Namen - Hoei: Geen treinen", de="Namen / Namur - Hoei / Huy: Keine Züge", en="Namur / Namen - Huy / Hoei: No trains"),
    "descriptionText": trs(fr="La circulation est interrompue.", nl="Het treinverkeer is onderbroken.", de="Unterbrochen.", en="Interrupted."),
    "url": trs(fr="http://example.org/fr", nl="http://example.org/nl")}},
  {"id": "rs:nmbssncb:a2", "alert": {"informedEntity": [{"agencyId": "nmbssncb"}], "activePeriod": [{"end": epoch("06:00")}],
    "headerText": trs(fr="Ancien - Fini"), "descriptionText": trs(fr="x")}}]}
open(os.path.join(out, "alerts-be.json"), "w").write(json.dumps(alertsbe))
