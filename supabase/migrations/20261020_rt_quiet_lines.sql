-- 20.10.2026: Belgian lines the SNCB live feed never reports.
-- SNCB sends only trains that deviate from the timetable; sync-realtime marked every running train that was
-- missing from the feed as "on time". On some lines (e.g. Antwerpen–Leuven, Antwerpen–Oostende) not a single
-- train appeared in the feed for a whole week, so those trains were shown as perfectly punctual without any data.
-- A line (pair of terminus stations from the trip id, both directions) is "quiet" when it had at least 15 trains
-- in the last 7 full days and none of them ever had a delay, cancellation or any deviation from the feed.
-- Counted by scheduled trains (not by trains that got data), so a line does not flip back and forth.
-- sync-realtime leaves trains of quiet lines without live data (the site shows them as "timetable"),
-- unless the feed does report them: then they get their real delay, and the next refresh drops the line.
-- Measured before switching on: ~0.13 s, no temporary files. Refreshed once a day.
create table if not exists public.rt_quiet_lines (
  country text not null,
  line text not null,
  trains integer not null,
  updated_at timestamptz not null default now(),
  primary key (country, line)
);
alter table public.rt_quiet_lines enable row level security;

create or replace function public.refresh_rt_quiet_lines()
 returns integer language plpgsql security definer
 set search_path to 'public' set work_mem to '64MB' set statement_timeout to '30s'
as $function$
declare n integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh_rt_quiet_lines')) then return -1; end if;
  with d as (select (now() at time zone 'Europe/Paris')::date t),
  q as (
    select 'be'::text country,
      least(split_part(trip_id, ':', 6), split_part(trip_id, ':', 7)) || '-' || greatest(split_part(trip_id, ':', 6), split_part(trip_id, ':', 7)) line,
      count(*)::integer trains
    from trains, d
    where country = 'be' and service_date between d.t - 7 and d.t - 1
      and split_part(trip_id, ':', 6) ~ '^\d{7}$' and split_part(trip_id, ':', 7) ~ '^\d{7}$'
    group by 2
    having count(*) >= 15
      and count(*) filter (where cancelled or delay_min > 0
        or exists (select 1 from jsonb_array_elements(stops) s where coalesce((s->>'delay')::int, 0) <> 0)) = 0),
  gone as (delete from public.rt_quiet_lines r where r.country = 'be' and not exists (select 1 from q where q.line = r.line)),
  up as (insert into public.rt_quiet_lines(country, line, trains, updated_at) select country, line, trains, now() from q
    on conflict (country, line) do update set trains = excluded.trains, updated_at = excluded.updated_at)
  select count(*) into n from q;
  return n;
end $function$;
revoke all on function public.refresh_rt_quiet_lines() from public, anon, authenticated;

-- read by sync-realtime (service role) once per run
create or replace function public.rt_quiet_lines_get(p_country text)
 returns text[] language sql stable security definer set search_path to 'public'
as $$ select coalesce(array_agg(line), '{}') from public.rt_quiet_lines where country = p_country $$;
revoke all on function public.rt_quiet_lines_get(text) from public, anon, authenticated;
grant execute on function public.rt_quiet_lines_get(text) to service_role;

-- once a day at 03:37 UTC, before the morning trains; created switched off, switched on after a measured manual run
select cron.schedule('rt-quiet-lines', '37 3 * * *', $$set statement_timeout = '30s'; select public.refresh_rt_quiet_lines();$$);
select cron.alter_job((select jobid from cron.job where jobname = 'rt-quiet-lines'), active := false);
