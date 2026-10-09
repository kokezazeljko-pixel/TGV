-- 8.10./9.10.2026: kašnjenja se proveravaju svakog minuta, ali red u tabeli trains se upisuje SAMO kad se nešto zaista
-- promenilo (kašnjenje, otkazivanje, broj, stanice/peroni). Ranije se svaki voz prepisivao svakog minuta: to je 9.10.2026
-- iscrpelo disk besplatne Supabase baze (sajt nije prikazivao vozove ~4 sata). Sajt svakog minuta preuzima samo promenjene vozove.
-- rt_updated_at = vreme poslednje promene; rt_checked_at = isto (stranica voza prikazuje "Ažurirano pre…").
alter table public.trains add column if not exists rt_checked_at timestamptz;

-- GTFS-RT (Francuska, Švajcarska, Belgija, Holandija…): stanice stižu cele
create or replace function public.apply_rt_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, stops jsonb)
  ), upd as (
    update public.trains t
       set delay_min = u.delay_min, cancelled = u.cancelled, stops = u.stops, rt_checked_at = now(), rt_updated_at = now()
      from u where t.id = u.id
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
       and (n.rt_updated_at is null or n.old_delay is distinct from n.delay_min or n.old_cancelled is distinct from n.cancelled
            or n.old_number is distinct from n.number or n.old_stops is distinct from n.stops)
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_de_updates(jsonb) from public, anon, authenticated;

-- brojevi nemačkih vozova unapred: sync-de kind=plan na svaka 2 minuta (pre toga svakog minuta)
select cron.unschedule('de-plan');
select cron.schedule('de-plan', '*/2 * * * *', $$select public.call_sync_de('plan')$$);
