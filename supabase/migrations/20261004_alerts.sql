-- Zvanična obaveštenja prevoznika (GTFS-RT Service Alerts), vezana za naše vozove.
-- Puni ih Edge funkcija sync-realtime (?kind=alerts) na svakih 5 minuta; sajt prikazuje samo ona osvežena u poslednjih 30 min.
create table if not exists public.alerts (
  id text primary key,                 -- zemlja + ':' + id obaveštenja u feedu
  country text not null check (country in ('fr','ch')),
  header text,
  description text,                    -- jednostavan HTML od prevoznika; sajt prikazuje samo tekst
  cause smallint,
  effect smallint,
  url text,
  active_from timestamptz,
  active_to timestamptz,
  train_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists alerts_train_ids_idx on public.alerts using gin (train_ids);
create index if not exists alerts_country_updated_idx on public.alerts (country, updated_at);
alter table public.alerts enable row level security;
create policy "Everyone can read alerts" on public.alerts for select using (true);
grant select on public.alerts to anon, authenticated;

-- SNCF koristi kratke oznake vožnji ("OCESN6805F"), naš red vožnje duge ("OCESN6805F1187_F:OUI:..."):
-- poredimo i po kratkom početku, i samo za dane kada obaveštenje važi.
create or replace function public.apply_alerts(p_country text, payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  a as (select * from jsonb_to_recordset(payload) as x(id text, header text, description text, cause smallint, effect smallint, url text, active_from timestamptz, active_to timestamptz, trip_ids text[])),
  t as (select t.id, t.trip_id, t.service_date, substring(t.trip_id from '^OCE[A-Z]+[0-9]+F') as short_id
        from public.trains t, d where t.country = p_country and t.service_date between d.today - 1 and d.today + 1),
  m as (
    select a.*, array(
      select t.id from t, d
      where (t.trip_id = any(a.trip_ids) or t.short_id = any(a.trip_ids))
        and t.service_date between coalesce((a.active_from at time zone 'Europe/Paris')::date, d.today)
                               and coalesce((a.active_to at time zone 'Europe/Paris')::date, d.today + 1)
    ) as tids
    from a
  )
  insert into public.alerts as al (id, country, header, description, cause, effect, url, active_from, active_to, train_ids, updated_at)
  select p_country || ':' || m.id, p_country, m.header, m.description, m.cause, m.effect, m.url, m.active_from, m.active_to, m.tids, now()
  from m where cardinality(m.tids) > 0
  on conflict (id) do update set header = excluded.header, description = excluded.description, cause = excluded.cause, effect = excluded.effect,
    url = excluded.url, active_from = excluded.active_from, active_to = excluded.active_to, train_ids = excluded.train_ids, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.apply_alerts(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_alerts(text, jsonb) to service_role;

create or replace function public.call_sync_alerts(p_country text)
returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-realtime?kind=alerts&country=' || p_country,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$;
revoke all on function public.call_sync_alerts(text) from public, anon, authenticated;
select cron.schedule('alerts-fr', '2-59/5 * * * *', $$select public.call_sync_alerts('fr')$$);
select cron.schedule('alerts-ch', '4-59/5 * * * *', $$select public.call_sync_alerts('ch')$$);
