-- Portugal (CP): već primenjeno na bazu, ovde stoji kao zapis.
-- Red vožnje (Alfa Pendular, Intercidades) iz publico.cp.pt/gtfs/gtfs.zip upisuje Edge funkcija sync-pt (supabase/functions/sync-pt).
-- CP nema otvorene podatke uživo: vozovi se prikazuju po redu vožnje (lib/format.js, SCHEDULE_ONLY), kao Luksemburg.

alter table trains drop constraint trains_country_check, add constraint trains_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt']));
alter table alerts drop constraint alerts_country_check, add constraint alerts_country_check check (country = any (array['fr','ch','be','nl','lu','es','pt']));
alter table profiles drop constraint profiles_home_country_ok, add constraint profiles_home_country_ok check (home_country is null or home_country = any (array['fr','ch','be','nl','lu','es','pt']));

create or replace function public.call_sync_pt(p_kind text) returns bigint language sql security definer set search_path to 'public','extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-pt?kind=' || p_kind,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$;
revoke all on function public.call_sync_pt(text) from public, anon, authenticated;

-- red vožnje za danas i sutra u 00:25 i 05:25 UTC
select cron.schedule('pt-schedule', '25 0,5 * * *', $$select public.call_sync_pt('schedule')$$);
