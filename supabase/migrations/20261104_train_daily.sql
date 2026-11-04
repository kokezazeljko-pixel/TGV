-- Archive of finished days (4.11.2026). The trains table keeps only about 8 days; this small table keeps one
-- line per train and day for good, so monthly reports and long-term punctuality are possible.
-- No stop lists, no comments: only what a report needs.

create table if not exists public.train_daily (
  id text primary key,                        -- the same id as in trains (day + trip)
  service_date date not null,
  country text not null,
  type text not null,
  number text not null default '',
  origin text,
  destination text,
  dep text,
  arr text,
  live boolean not null default false,       -- the train had live data that day
  delay_min int,                              -- delay at the end of the trip (minutes)
  max_delay int,                              -- biggest delay at any stop
  cancelled boolean not null default false,
  stops int,                                  -- stops in the timetable
  skipped int                                 -- stops not served (partly cancelled)
);
create index if not exists train_daily_day_idx on public.train_daily (service_date, country);
create index if not exists train_daily_num_idx on public.train_daily (country, number, service_date);
create index if not exists train_daily_route_idx on public.train_daily (country, origin, destination, service_date);
alter table public.train_daily enable row level security; -- read only through the report functions

-- Copies the finished days p_from..p_to from trains into train_daily (again if run twice: newer data wins).
create or replace function public.archive_train_days(p_from date, p_to date)
returns int language sql security definer set search_path to 'public' as $function$
  with ins as (
    insert into public.train_daily as d (id, service_date, country, type, number, origin, destination, dep, arr,
                                         live, delay_min, max_delay, cancelled, stops, skipped)
    select t.id, t.service_date, t.country, t.type, coalesce(t.number, ''), t.origin, t.destination, t.dep, t.arr,
           t.rt_updated_at is not null, t.delay_min,
           (select max((s->>'delay')::int) from jsonb_array_elements(t.stops) s),
           coalesce(t.cancelled, false),
           jsonb_array_length(t.stops),
           (select count(*) from jsonb_array_elements(t.stops) s where (s->>'skipped')::boolean)
    from public.trains t
    where t.service_date between p_from and p_to
    on conflict (id) do update set
      type = excluded.type, number = excluded.number, origin = excluded.origin, destination = excluded.destination,
      dep = excluded.dep, arr = excluded.arr, live = excluded.live, delay_min = excluded.delay_min,
      max_delay = excluded.max_delay, cancelled = excluded.cancelled, stops = excluded.stops, skipped = excluded.skipped
    returning 1
  )
  select count(*)::int from ins;
$function$;
revoke all on function public.archive_train_days(date, date) from public, anon, authenticated;

-- Every night at 04:45 UTC: the last three finished days (a night train's last delay arrives the next morning).
select cron.schedule('archive-days', '45 4 * * *', $$select public.archive_train_days(((now() at time zone 'Europe/Paris')::date - 3), ((now() at time zone 'Europe/Paris')::date - 1))$$);
-- First filled on 4.11.2026 with 27.10.–3.11.2026 (the days still in trains).
