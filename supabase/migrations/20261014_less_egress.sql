-- The trains a live-delay function needs right now, picked by the database (less data transferred = less Supabase egress).
-- Before 11.10.2026 sync-de, sync-at and sync-lu read every train of 2–3 days with all its stops every minute (several MB a
-- minute, most of the 5 GB monthly egress of the free plan) and threw most of them away.
-- A train counts from p_before seconds before its first stop until p_after seconds (plus its delay) after its last stop.
-- p_ahead > 0 (Germany): also trains starting within that many seconds that still have no number (matched to DB's plan early).
-- Stops come back slim: only what the matching uses (name, id, arr, dep, pf).
create or replace function public.rt_trains(p_country text, p_before integer, p_after integer, p_ahead integer default 0)
returns table(id text, service_date date, type text, number text, delay_min integer, ahead boolean, stops jsonb)
language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  t as (
    select t.*,
      (t.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => public.gtfs_secs(coalesce(t.stops->0->>'dep', t.stops->0->>'arr', t.dep))) as t0,
      (t.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => public.gtfs_secs(coalesce(t.stops->(-1)->>'arr', t.stops->(-1)->>'dep', t.arr))) as t1
    from public.trains t, d
    where t.country = p_country and t.service_date between d.today - 1 and d.today + 1 and jsonb_array_length(t.stops) >= 2
  ), w as (
    select t.*, now() between t.t0 - make_interval(secs => p_before) and t.t1 + make_interval(secs => p_after + coalesce(t.delay_min, 0) * 60) as running
    from t
  )
  select w.id, w.service_date, w.type, w.number, w.delay_min, not w.running as ahead,
    (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', e->'name', 'id', e->'id', 'arr', e->'arr', 'dep', e->'dep', 'pf', e->'pf')) order by o)
       from jsonb_array_elements(w.stops) with ordinality as a(e, o)) as stops
  from w
  where w.running
     or (p_ahead > 0 and coalesce(w.number, '') = '' and w.type <> 'FLX' and w.t0 > now() and w.t0 <= now() + make_interval(secs => p_ahead));
$$;
revoke all on function public.rt_trains(text, integer, integer, integer) from public, anon, authenticated;

-- Already applied in Supabase on 2026-10-11 (migrations rt_trains_window and rt_plan_compact).

-- Same text as deNorm() in ingest/lib/germany.mjs: "Frankfurt (Main) Hbf" -> "frankfurtmainhbf".
create or replace function public.de_norm(s text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(replace(lower(regexp_replace(normalize(coalesce(s, ''), NFD), '[̀-ͯ]', '', 'g')), 'hauptbahnhof', 'hbf'), '\ybahnhof\y|\ybf\y', '', 'g'), '[^a-z0-9]+', '', 'g')
$$;

-- DB timetable rows (de_plan) for the minute run of sync-de / sync-at, as compact arrays
-- [eva, cat, num, ar_pt, dp_pt, ar_ct, dp_ct, pp, cp, cs] (times in epoch seconds).
-- Only rows at a station and minute (+-6) where one of the trains of rt_trains() stops: the matching
-- in germanUpdates() looks only +-5 minutes around each stop, so the result is exactly the same as
-- with all rows, but far less is sent (Supabase egress).
create or replace function public.rt_plan(p_country text, p_before integer, p_after integer, p_ahead integer default 0)
returns json language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  tr as (select * from public.rt_trains(p_country, p_before, p_after, p_ahead)),
  st as (select distinct public.de_norm(e->>'name') as hub,
           (extract(epoch from ((tr.service_date::timestamp + interval '12 hours') at time zone 'Europe/Paris') - interval '12 hours') + public.gtfs_secs(x.t)) / 60 as m
         from tr, jsonb_array_elements(tr.stops) e, lateral (values (e->>'arr'), (e->>'dep')) x(t) where x.t is not null),
  hubs as (select distinct h.eva, public.de_norm(v.n) as hub
           from (select name, station, eva from public.de_hubs where p_country = 'de'
                 union all select name, station, eva from public.at_hubs where p_country = 'at') h,
                lateral (values (h.name), (h.station)) v(n)
           where h.eva is not null and v.n is not null and public.de_norm(v.n) <> ''),
  p as (select p.* from public.de_plan p, d
        where p.eva in (select eva from hubs)
          and p.day between d.today - 1 and d.today + (case when p_country = 'at' then 0 else 1 end)
          and (p.dp_pt >= now() - interval '12 hours' or p.ar_pt >= now() - interval '12 hours')
          and exists (select 1 from hubs h join st on st.hub = h.hub
                      where h.eva = p.eva
                        and (abs(st.m - extract(epoch from p.ar_pt) / 60) <= 6 or abs(st.m - extract(epoch from p.dp_pt) / 60) <= 6)))
  select coalesce(json_agg(json_build_array(p.eva, p.cat, p.num,
           extract(epoch from p.ar_pt)::bigint, extract(epoch from p.dp_pt)::bigint,
           extract(epoch from p.ar_ct)::bigint, extract(epoch from p.dp_ct)::bigint, p.pp, p.cp, p.cs) order by p.eva, p.sid), '[]'::json)
  from p;
$$;
revoke all on function public.rt_plan(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.de_norm(text) from anon, authenticated;

-- sync-realtime (France, Switzerland, Belgium, Netherlands): like rt_candidates(), but stops without the old
-- delay/skipped values (the feed sets them again anyway) and trains only until p_after seconds after arrival (+ delay).
create or replace function public.rt_candidates_slim(p_country text, p_before integer default 3600, p_after integer default 3600)
returns table(id text, trip_id text, service_date date, delay_min integer, stops jsonb)
language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  secs as (
    select t.*,
      public.gtfs_secs(coalesce(t.stops->0->>'dep', t.stops->0->>'arr', t.dep)) as s0,
      public.gtfs_secs(coalesce(t.stops->(-1)->>'arr', t.stops->(-1)->>'dep', t.arr)) as s1
    from public.trains t, d
    where t.country = p_country and t.service_date in (d.today - 1, d.today)
  )
  select s.id, s.trip_id, s.service_date, s.delay_min,
    (select jsonb_agg(jsonb_build_array(e->'seq', e->'id', e->'arr', e->'dep', e->'pf', e->'st') order by o)
       from jsonb_array_elements(s.stops) with ordinality as a(e, o)) as stops
  from secs s
  where now() between (s.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => s.s0 - p_before)
                  and (s.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => s.s1 + p_after + coalesce(s.delay_min, 0) * 60);
$$;
revoke all on function public.rt_candidates_slim(text, integer, integer) from public, anon, authenticated;
