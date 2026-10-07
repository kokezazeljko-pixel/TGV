-- Nemačka (DB): već primenjeno na bazu, ovde stoji kao zapis.
-- Red vožnje (gtfs.de) i kašnjenja (DB Timetables API, 56 čvorišta) radi Edge funkcija sync-de (supabase/functions/sync-de).
-- Ključevi DB_CLIENT_ID i DB_API_KEY stoje SAMO u Supabase -> Edge Functions -> Secrets, nikad u kodu.
-- Pomoćne tabele de_hubs, de_plan i de_plan_hours su napravljene ranije (pregled Nemačke).

alter table trains drop constraint trains_country_check, add constraint trains_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt','de']));
alter table alerts drop constraint alerts_country_check, add constraint alerts_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt','de']));
alter table profiles drop constraint profiles_home_country_ok, add constraint profiles_home_country_ok check (home_country is null or home_country = any (array['fr','ch','be','nl','lu','es','pt','de']));
alter table trains alter column number set default '';

-- kašnjenja, otkazivanja, perone i broj voza (iz DB plana) upisuje sync-de
create or replace function public.apply_de_updates(payload jsonb) returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, d jsonb, number text)
  ), upd as (
    update public.trains t
       set delay_min = u.delay_min, cancelled = u.cancelled, rt_updated_at = now(),
           number = coalesce(u.number, t.number),
           stops = (select jsonb_agg(
                      (e - 'apf') || jsonb_build_object('delay', coalesce(u.d->(o::int - 1)->0, e->'delay', '0'::jsonb),
                                                        'skipped', coalesce(u.d->(o::int - 1)->1, 'false'::jsonb))
                      || case when jsonb_typeof(u.d->(o::int - 1)->2) = 'string' then jsonb_build_object('apf', u.d->(o::int - 1)->2) else '{}'::jsonb end
                      order by o)
                      from jsonb_array_elements(t.stops) with ordinality as a(e, o))
      from u where t.id = u.id and t.country = 'de'
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_de_updates(jsonb) from public, anon, authenticated;

-- poziv Edge funkcije sa tajnim žetonom iz Vault-a
create or replace function public.call_sync_de(p_kind text) returns bigint language sql security definer set search_path to 'public','extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-de?kind=' || p_kind,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$;
revoke all on function public.call_sync_de(text) from public, anon, authenticated;

-- kašnjenja svakog minuta (4 čvorišta po pozivu), red vožnje (danas + sutra) u 00:10 i 05:10 UTC
select cron.unschedule(jobname) from cron.job where jobname like 'de-preview%';
select cron.schedule('de-rt', '* * * * *', $$select public.call_sync_de('rt')$$);
select cron.schedule('de-schedule', '10 0,5 * * *', $$select public.call_sync_de('schedule')$$);

-- 7.10.2026: više glavnih stanica za brojeve vozova i kašnjenja (bilo 56, sada 149); sync-de obrađuje 10 stanica po pozivu
insert into de_hubs(name) select n from unnest(array[
'Berlin Gesundbrunnen','Berlin Ostbahnhof','Berlin Ostkreuz','Flughafen BER','Frankfurt(Oder)','Dresden-Neustadt','Chemnitz Hbf','Schwerin Hbf','Stralsund Hbf','Greifswald','Neumünster','Flensburg','Itzehoe','Husum','Westerland(Sylt)','Oldenburg(Oldb)','Emden Hbf','Leer(Ostfriesl)','Lüneburg','Uelzen','Stendal Hbf','Wittenberge','Ludwigslust','Potsdam Hbf','Cottbus Hbf','Hildesheim Hbf','Minden(Westf)','Herford','Gütersloh Hbf','Paderborn Hbf','Hagen Hbf','Wuppertal Hbf','Solingen Hbf','Gelsenkirchen Hbf','Recklinghausen Hbf','Oberhausen Hbf','Bochum Hbf','Mönchengladbach Hbf','Krefeld Hbf','Neuss Hbf','Siegen Hbf','Gießen','Marburg(Lahn)','Hanau Hbf','Aschaffenburg Hbf','Bad Hersfeld','Eisenach','Gotha','Weimar','Jena Paradies','Naumburg(Saale)Hbf','Saalfeld(Saale)','Coburg','Lutherstadt Wittenberg Hbf','Bitterfeld','Köthen','Trier Hbf','Kaiserslautern Hbf','Ludwigshafen(Rh)Hbf','Worms Hbf','Pforzheim Hbf','Baden-Baden','Tübingen Hbf','Singen(Hohentwiel)','Konstanz','Aalen Hbf','Crailsheim','Ansbach','Treuchtlingen','Donauwörth','Erlangen','München-Pasing','München Ost','Rosenheim','Lindau-Reutlingen','Kempten(Allgäu)Hbf','Friedrichshafen Stadt','Garmisch-Partenkirchen','Landshut(Bay)Hbf','Rheine','Bad Bentheim','Emmerich','Celle','Verden(Aller)','Nienburg(Weser)','Montabaur','Limburg Süd','Bremerhaven Hbf','Plattling','Salzwedel','Brandenburg Hbf','Eberswalde Hbf','Ostseebad Binz'
]) n where not exists (select 1 from de_hubs h where h.name = n);

-- 7.10.2026: FlixTrain (red vožnje iz Flix GTFS, kind=flix), kašnjenja iz DB plana samo za FLX redove sa istim brojem
insert into de_hubs(name) select n from unnest(array['Frankfurt(Main)Süd','Berlin-Wannsee','Hamburg-Harburg']) n where not exists (select 1 from de_hubs h where h.name = n);
select cron.schedule('de-flix', '15 0,5 * * *', $$select public.call_sync_de('flix')$$);
