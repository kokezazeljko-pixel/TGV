-- A train that serves at most one of its stops (all others skipped) is cancelled, as already for DE/AT
-- (IC 637 Basel–Brig 4.11.2026: only Basel served, shown as running). Same rule as apply_de_updates.
create or replace function public.apply_rt_delays(payload jsonb)
returns integer language sql security definer set search_path to 'public' as $function$
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
  ), upd as (
    update public.trains t
       set delay_min = n.delay_min, cancelled = n.cancelled, stops = n.stops, rt_checked_at = now(), rt_updated_at = now()
      from n where t.id = n.id
       and public.rt_delays_ok(n.delay_min, n.stops)
       and (n.rt_updated_at is null or n.old_delay is distinct from n.delay_min or n.old_cancelled is distinct from n.cancelled or n.old_stops is distinct from n.stops)
    returning 1
  )
  select count(*)::integer from upd;
$function$;
