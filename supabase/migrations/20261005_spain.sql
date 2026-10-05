-- Španija (Renfe): već primenjeno na bazu, ovde stoji kao zapis.
-- Red vožnje i kašnjenja radi Edge funkcija sync-es (supabase/functions/sync-es), bez GitHub skripte i bez ključa.

alter table trains drop constraint trains_country_check, add constraint trains_country_check check (country = any (array['fr','ch','be','nl','lu','es']));
alter table alerts drop constraint alerts_country_check, add constraint alerts_country_check check (country = any (array['fr','ch','be','nl','lu','es']));
alter table profiles drop constraint profiles_home_country_ok, add constraint profiles_home_country_ok check (home_country is null or home_country = any (array['fr','ch','be','nl','lu','es']));

-- poziv Edge funkcije sa tajnim žetonom iz Vault-a (kao call_sync_de)
create or replace function public.call_sync_es(p_kind text) returns bigint language sql security definer set search_path to 'public','extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-es?kind=' || p_kind,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$;
revoke all on function public.call_sync_es(text) from public, anon, authenticated;

-- kašnjenja svakog minuta, red vožnje (danas + sutra) u 00:20 i 05:20 UTC
select cron.schedule('es-rt', '* * * * *', $$select public.call_sync_es('rt')$$);
select cron.schedule('es-schedule', '20 0,5 * * *', $$select public.call_sync_es('schedule')$$);
