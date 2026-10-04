-- Kašnjenja osvežava Supabase Edge funkcija "sync-realtime" (pokreće je pg_cron na svakih nekoliko minuta).
-- Funkcija čita samo vozove koji su sada u vožnji ili uskoro kreću, u sažetom obliku, da bi prenos podataka bio mali.

-- "HH:MM[:SS]" (može i preko 24:00) -> sekunde od ponoći
create or replace function public.gtfs_secs(x text) returns integer language sql immutable as $$
  select split_part(x, ':', 1)::int * 3600 + split_part(x, ':', 2)::int * 60 + coalesce(nullif(split_part(x, ':', 3), '')::int, 0);
$$;

-- Vozovi zemlje koji voze sada (od 60 min pre polaska do 120 min posle dolaska + kašnjenje).
-- stops: [[seq, id, arr, dep, delay, skipped], ...]
create or replace function public.rt_candidates(p_country text)
returns table (id text, trip_id text, service_date date, delay_min integer, cancelled boolean, stops jsonb)
language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  secs as (
    select t.*,
      public.gtfs_secs(coalesce(t.stops->0->>'dep', t.stops->0->>'arr', t.dep)) as s0,
      public.gtfs_secs(coalesce(t.stops->(-1)->>'arr', t.stops->(-1)->>'dep', t.arr)) as s1
    from public.trains t, d
    where t.country = p_country and t.service_date in (d.today - 1, d.today)
  )
  select s.id, s.trip_id, s.service_date, s.delay_min, s.cancelled,
    (select jsonb_agg(jsonb_build_array(e->'seq', e->'id', e->'arr', e->'dep', coalesce(e->'delay', '0'::jsonb), coalesce(e->'skipped', 'false'::jsonb)) order by o)
       from jsonb_array_elements(s.stops) with ordinality as a(e, o)) as stops
  from secs s
  where now() between (s.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => s.s0 - 3600)
                  and (s.service_date::timestamp at time zone 'Europe/Paris') + make_interval(secs => s.s1 + 7200 + coalesce(s.delay_min, 0) * 60);
$$;

-- Upis kašnjenja: payload = [{id, delay_min, cancelled, d: [[delay, skipped], ...]}]; ostali podaci o stanicama ostaju.
create or replace function public.apply_rt_delays(payload jsonb)
returns integer language sql security definer set search_path = public as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb)
  ), upd as (
    update public.trains t
       set delay_min = u.delay_min, cancelled = u.cancelled, rt_updated_at = now(),
           stops = (select jsonb_agg(e || jsonb_build_object('delay', coalesce(u.d->(o::int - 1)->0, e->'delay', '0'::jsonb),
                                                               'skipped', coalesce(u.d->(o::int - 1)->1, 'false'::jsonb)) order by o)
                      from jsonb_array_elements(t.stops) with ordinality as a(e, o))
      from u where t.id = u.id
    returning 1
  )
  select count(*)::integer from upd;
$$;

-- Tajni žeton kojim pg_cron poziva funkciju (čuva se u Vault-u, nikad ne izlazi iz baze)
create or replace function public.cron_token_ok(t text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'rt_cron_token' and decrypted_secret = t);
$$;

revoke all on function public.rt_candidates(text) from public, anon, authenticated;
revoke all on function public.apply_rt_delays(jsonb) from public, anon, authenticated;
revoke all on function public.cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.rt_candidates(text) to service_role;
grant execute on function public.apply_rt_delays(jsonb) to service_role;
grant execute on function public.cron_token_ok(text) to service_role;
