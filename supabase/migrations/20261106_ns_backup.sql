-- NS Reisinformatie as a backup live source for Dutch trains (Edge Function sync-ns).
-- It fills only trains that OVapi has not updated in the last 10 minutes; rows it wrote carry rt_source = 'ns'.
alter table public.trains add column if not exists rt_source text;

-- Dutch trains running now (20 min before the first departure until 30 min after the last arrival)
-- that the backup may fill. Stops: [seq, arr, dep, pf, st, delay].
create or replace function public.ns_candidates()
returns table(id text, number text, service_date date, delay_min integer, rt_updated_at timestamptz, rt_source text, stops jsonb)
language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone 'Europe/Amsterdam')::date as today),
  s as (
    select t.*,
      public.gtfs_secs(coalesce(t.stops->0->>'dep', t.stops->0->>'arr', t.dep)) as s0,
      public.gtfs_secs(coalesce(t.stops->(-1)->>'arr', t.stops->(-1)->>'dep', t.arr)) as s1
    from public.trains t, d
    where t.country = 'nl' and t.service_date in (d.today - 1, d.today) and t.number ~ '^\d+$'
  )
  select s.id, s.number, s.service_date, s.delay_min, s.rt_updated_at, s.rt_source,
    (select jsonb_agg(jsonb_build_array(e->'seq', e->'arr', e->'dep', e->'pf', e->'st', e->'delay') order by o)
       from jsonb_array_elements(s.stops) with ordinality as a(e, o)) as stops
  from s
  where now() between (s.service_date::timestamp at time zone 'Europe/Amsterdam') + make_interval(secs => s.s0 - 1200)
                  and (s.service_date::timestamp at time zone 'Europe/Amsterdam') + make_interval(secs => s.s1 + 1800 + coalesce(s.delay_min, 0) * 60)
    and (s.rt_updated_at is null or s.rt_source = 'ns' or s.rt_updated_at < now() - interval '10 minutes');
$$;

-- Writes the backup's delays through the usual apply_rt_delays (same checks), only for rows OVapi is not keeping fresh.
create or replace function public.apply_ns_delays(payload jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare p jsonb; n integer;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into p
    from jsonb_array_elements(payload) x join public.trains t on t.id = x->>'id'
   where t.country = 'nl' and (t.rt_updated_at is null or t.rt_source = 'ns' or t.rt_updated_at < now() - interval '10 minutes');
  n := public.apply_rt_delays(p);
  update public.trains t set rt_source = 'ns'
    from jsonb_array_elements(p) x
   where t.id = x->>'id' and t.rt_updated_at > now() - interval '2 minutes' and t.rt_source is distinct from 'ns';
  return n;
end $$;

create or replace function public.call_sync_ns()
returns bigint language sql security definer set search_path to 'public', 'extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-ns',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'rt_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$;

revoke all on function public.ns_candidates() from public, anon, authenticated;
revoke all on function public.apply_ns_delays(jsonb) from public, anon, authenticated;
revoke all on function public.call_sync_ns() from public, anon, authenticated;
grant execute on function public.ns_candidates() to service_role;
grant execute on function public.apply_ns_delays(jsonb) to service_role;

-- every 5 minutes (created inactive, switched on after a checked manual run)
select cron.schedule('ns-nl', '3-59/5 * * * *', 'select public.call_sync_ns()');
