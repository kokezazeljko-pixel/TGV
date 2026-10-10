-- Austrija (ÖBB) – primenjeno na bazu 10.10.2026 (objava Austrije).
-- Red vožnje: ÖBB GTFS (Edge funkcija sync-at, kind=schedule; zip se čita range zahtevima, ~3 MB umesto 170 MB).
-- Kašnjenja: DB Timetables na austrijskim stanicama (isto kao Nemačka; plan i izmene idu u de_plan po broju stanice).
-- Ključevi DB_CLIENT_ID i DB_API_KEY su već u Supabase -> Edge Functions -> Secrets (isti kao za Nemačku).
-- ÖBB objavljuje novi GTFS jednom godišnje (sredinom decembra, nova adresa): AT_GTFS_URL u ingest/lib/austria.mjs.

alter table trains drop constraint trains_country_check, add constraint trains_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt','de','at']));
alter table alerts drop constraint alerts_country_check, add constraint alerts_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt','de','at']));
alter table profiles drop constraint profiles_home_country_ok, add constraint profiles_home_country_ok check (home_country is null or home_country = any (array['fr','ch','be','nl','lu','es','pt','de','at']));

-- austrijske stanice za kašnjenja (ime = naziv kao na sajtu; eva = broj stanice kod DB)
create table if not exists public.at_hubs (
  name text primary key,
  eva text,
  station text,
  last_fchg timestamptz,
  last_error text
);
alter table public.at_hubs enable row level security; -- samo Edge funkcija (service role) ga čita
insert into public.at_hubs(name, eva) values
 ('Wien Hbf','8103000'),('Wien Meidling','8100514'),('Wien Westbahnhof','8100003'),('Wien Hütteldorf','8100447'),('Flughafen Wien','8100353'),
 ('St. Pölten Hbf','8100008'),('Amstetten','8100012'),('Linz Hbf','8100013'),('Wels Hbf','8100014'),('Attnang-Puchheim','8100017'),
 ('Salzburg Hbf','8100002'),('Bischofshofen','8100042'),('Schwarzach-St. Veit','8100044'),('Zell am See','8100048'),
 ('Kufstein','8100001'),('Wörgl Hbf','8100099'),('Jenbach','8100102'),('Innsbruck Hbf','8100108'),('Imst-Pitztal','8100062'),('Landeck-Zams','8100063'),
 ('Bludenz','8100067'),('Feldkirch','8100197'),('Dornbirn','8100122'),('Bregenz','8100090'),
 ('Wiener Neustadt Hbf','8100516'),('Leoben Hbf','8100070'),('Selzthal','8100150'),('Graz Hbf','8100173'),('Spielfeld-Straß','8100082'),
 ('Klagenfurt Hbf','8100085'),('Villach Hbf','8100147')
on conflict (name) do nothing;

-- kašnjenja, otkazivanja i peroni (broj voza ostaje iz ÖBB reda vožnje);
-- piše se samo voz kome se nešto promenilo, i nikad nemoguće kašnjenje (preko 12 h, vidi 20261013_reject_impossible_delays.sql)
create or replace function public.apply_at_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
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

create or replace function public.call_sync_at(p_kind text) returns bigint language sql security definer set search_path to 'public','extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-at?kind=' || p_kind,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.call_sync_at(text) from public, anon, authenticated;

-- red vožnje (danas + sutra) u 00:20 i 05:20 UTC, kašnjenja svakog minuta (6 stanica po pozivu)
select cron.schedule('at-schedule', '20 0,5 * * *', $$select public.call_sync_at('schedule')$$);
select cron.schedule('at-rt', '* * * * *', $$select public.call_sync_at('rt')$$);
select public.call_sync_at('schedule');
-- trains_preview: kind=preview piše tamo za proveru mape pre objave (ranije samo za 'de'); posle objave se briše
alter table public.trains_preview drop constraint if exists trains_preview_country_check;
delete from public.trains_preview where country = 'at';
