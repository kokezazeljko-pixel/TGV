-- Voz koji posle otkazivanja staje na najviše jednoj stanici je otkazan (Nemačka i Austrija, podaci DB-a).
-- 30.10.2026: ICE 1674 Frankfurt–Bremen – otkazano 8 od 9 stanica, Bremen kod DB-a i dalje "dolazi +4",
-- a na sajtu je voz bio "vozi". Isto pravilo je u ingest/lib/germany.mjs (germanUpdates); ovde važi odmah,
-- bez novog objavljivanja Edge funkcija sync-de i sync-at.
-- Pravilo: bar 2 otkazane stanice i najviše 1 na kojoj voz staje. Voz koji vozi bar deo puta (IC 2162 samo
-- Vaihingen–Karlsruhe) ostaje neotkazan.

create or replace function public.rt_one_stop_left(d jsonb) returns boolean language sql immutable as $$
  select coalesce((select count(*) filter (where (e->>1)::boolean) >= 2
                      and count(*) filter (where not coalesce((e->>1)::boolean, false)) <= 1
                     from jsonb_array_elements(case when jsonb_typeof(d) = 'array' then d else '[]'::jsonb end) e), false);
$$;

create or replace function public.apply_de_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u0 as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb, number text)
  ), u as (
    select id, d, number, c as cancelled, case when c then 0 else delay_min end as delay_min
      from u0, lateral (select coalesce(u0.cancelled, false) or public.rt_one_stop_left(u0.d) as c) x
  ), n as (
    select t.id, u.delay_min, u.cancelled, coalesce(u.number, t.number) as number, t.rt_updated_at,
           t.delay_min as old_delay, t.cancelled as old_cancelled, t.number as old_number, t.stops as old_stops,
           (select jsonb_agg(
              (e - 'apf') || jsonb_build_object('delay', coalesce(u.d->(o::int - 1)->0, e->'delay', '0'::jsonb),
                                                'skipped', coalesce(u.d->(o::int - 1)->1, 'false'::jsonb))
              || case when jsonb_typeof(u.d->(o::int - 1)->2) = 'string' then jsonb_build_object('apf', u.d->(o::int - 1)->2) else '{}'::jsonb end
              order by o)
              from jsonb_array_elements(t.stops) with ordinality as a(e, o)) as stops
      from public.trains t join u on t.id = u.id
     where t.country = 'de'
  ), upd as (
    update public.trains t
       set delay_min = n.delay_min, cancelled = n.cancelled, number = n.number, stops = n.stops, rt_checked_at = now(), rt_updated_at = now()
      from n where t.id = n.id
       and public.rt_delays_ok(n.delay_min, n.stops)
       and (n.rt_updated_at is null or n.old_delay is distinct from n.delay_min or n.old_cancelled is distinct from n.cancelled
            or n.old_number is distinct from n.number or n.old_stops is distinct from n.stops)
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_de_updates(jsonb) from public, anon, authenticated;

create or replace function public.apply_at_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u0 as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb)
  ), u as (
    select id, d, c as cancelled, case when c then 0 else delay_min end as delay_min
      from u0, lateral (select coalesce(u0.cancelled, false) or public.rt_one_stop_left(u0.d) as c) x
  ), n as (
    select t.id, u.delay_min, u.cancelled, t.rt_updated_at, t.delay_min as old_delay, t.cancelled as old_cancelled, t.stops as old_stops,
           (select jsonb_agg(
              (e - 'apf') || jsonb_build_object('delay', coalesce(u.d->(o::int - 1)->0, e->'delay', '0'::jsonb),
                                                'skipped', coalesce(u.d->(o::int - 1)->1, 'false'::jsonb))
              || case when jsonb_typeof(u.d->(o::int - 1)->2) = 'string' then jsonb_build_object('apf', u.d->(o::int - 1)->2) else '{}'::jsonb end
              order by o)
              from jsonb_array_elements(t.stops) with ordinality as a(e, o)) as stops
      from public.trains t join u on t.id = u.id
     where t.country = 'at'
  ), upd as (
    update public.trains t
       set delay_min = n.delay_min, cancelled = n.cancelled, stops = n.stops, rt_checked_at = now(), rt_updated_at = now()
      from n where t.id = n.id
       and public.rt_delays_ok(n.delay_min, n.stops)
       and (n.rt_updated_at is null or n.old_delay is distinct from n.delay_min or n.old_cancelled is distinct from n.cancelled or n.old_stops is distinct from n.stops)
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_at_updates(jsonb) from public, anon, authenticated;
revoke all on function public.rt_one_stop_left(jsonb) from public, anon, authenticated;

-- ispravka već upisanih vozova (poslednjih nedelju dana)
update public.trains t set cancelled = true, delay_min = 0
 where t.country in ('de', 'at') and not coalesce(t.cancelled, false) and t.rt_updated_at is not null
   and public.rt_one_stop_left((select jsonb_agg(jsonb_build_array(0, coalesce((s->>'skipped')::boolean, false))) from jsonb_array_elements(t.stops) s));
