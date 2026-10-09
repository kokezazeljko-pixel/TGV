-- A delay over 12 hours is a data error from the source (9.10.2026: mobiliteit.lu sent RE 5122 with the next day's
-- date at Wasserbillig, shown on the site as "+1450 min" instead of +10). Such an update is not written: the train keeps
-- its last good state. The daily check (ingest/check-maps.mjs) also fails if a train today has such a delay.
-- Already applied in Supabase on 9.10.2026 (migration reject_impossible_delays).
create or replace function public.rt_delays_ok(delay_min integer, stops jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(delay_min, 0) between -60 and 720
     and not exists (select 1 from jsonb_array_elements(coalesce(stops, '[]'::jsonb)) s
                      where jsonb_typeof(s->'delay') = 'number' and (s->>'delay')::numeric not between -60 and 720);
$$;

-- the same three functions as in 20261011_write_only_changes.sql, plus the rt_delays_ok guard
create or replace function public.apply_rt_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, stops jsonb)
  ), upd as (
    update public.trains t
       set delay_min = u.delay_min, cancelled = u.cancelled, stops = u.stops, rt_checked_at = now(), rt_updated_at = now()
      from u where t.id = u.id
       and public.rt_delays_ok(u.delay_min, u.stops)
       and (t.rt_updated_at is null or t.delay_min is distinct from u.delay_min or t.cancelled is distinct from u.cancelled or t.stops is distinct from u.stops)
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_rt_updates(jsonb) from public, anon, authenticated;

-- kašnjenja po stanicama (Španija, Luksemburg…)
create or replace function public.apply_rt_delays(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb)
  ), n as (
    select t.id, u.delay_min, u.cancelled, t.rt_updated_at, t.delay_min as old_delay, t.cancelled as old_cancelled, t.stops as old_stops,
           (select jsonb_agg(
              (e - 'apf') || jsonb_build_object('delay', coalesce(u.d->(o::int - 1)->0, e->'delay', '0'::jsonb),
                                                'skipped', coalesce(u.d->(o::int - 1)->1, 'false'::jsonb))
              || case when jsonb_typeof(u.d->(o::int - 1)->2) = 'string' then jsonb_build_object('apf', u.d->(o::int - 1)->2) else '{}'::jsonb end
              order by o)
              from jsonb_array_elements(t.stops) with ordinality as a(e, o)) as stops
      from public.trains t join u on t.id = u.id
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
revoke all on function public.apply_rt_delays(jsonb) from public, anon, authenticated;

-- Nemačka (DB): isto, plus broj voza
create or replace function public.apply_de_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb, number text)
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
