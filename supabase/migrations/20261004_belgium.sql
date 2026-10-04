-- Belgium (SNCB) – applied in Supabase on 2026-10-04 (this file documents it).
alter table public.trains drop constraint trains_country_check, add constraint trains_country_check check (country in ('fr','ch','be'));
alter table public.alerts drop constraint alerts_country_check, add constraint alerts_country_check check (country in ('fr','ch','be'));

-- SNCB notices are linked to the whole network: a notice goes to every train (today/tomorrow) that stops at
-- the stations named in its title ("Namur - Huy : Aucun train"), at least `need` of them.
-- (full body: see the live function public.apply_alerts_stations in Supabase)

-- delays every 3 minutes, notices every 5 minutes
select cron.schedule('rt-be', '2-59/3 * * * *', $$select public.call_sync_realtime('be')$$);
select cron.schedule('alerts-be', '1-59/5 * * * *', $$select public.call_sync_alerts('be')$$);
