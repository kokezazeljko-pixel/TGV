-- Station pages (17.11.2026): one lasting page per busy station (/station/<country>/<name>) with today's trains
-- through the station and how punctual they were there over the last 7 days.
-- station_stats holds the 7-day figures per station, rebuilt every night by refresh_station_stats() (upsert only:
-- a station that drops below the threshold keeps its page for 30 days, so pages do not appear and disappear).
create table if not exists public.station_stats (
  country text not null, name text not null, lat double precision, lon double precision,
  trains int, measured int, on_time int, late15 int, cancelled int, avg_delay numeric,
  first_day date, last_day date, refreshed date not null,
  primary key (country, name)
);
alter table public.station_stats enable row level security; -- read only through the functions below

create or replace function public.refresh_station_stats()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare today date := (now() at time zone 'Europe/Paris')::date; n integer;
begin
  insert into public.station_stats
  select country, name, avg(lat), avg(lon), count(distinct id),
         count(*) filter (where m), count(*) filter (where m and coalesce(delay, 0) <= 5),
         count(*) filter (where m and coalesce(delay, 0) >= 15), count(*) filter (where sk),
         round(avg(coalesce(delay, 0)) filter (where m), 1), min(service_date), max(service_date), today
  from (
    select t.country, t.id, t.service_date, a.e->>'name' as name, (a.e->>'lat')::float8 as lat, (a.e->>'lon')::float8 as lon,
           (a.e->>'delay')::int as delay, (t.cancelled or coalesce((a.e->>'skipped')::boolean, false)) as sk,
           (t.rt_updated_at is not null and not (t.cancelled or coalesce((a.e->>'skipped')::boolean, false))) as m
    from public.trains t, jsonb_array_elements(t.stops) a(e)
    where t.service_date between today - 7 and today - 1 and a.e->>'name' is not null
  ) s
  group by 1, 2
  having count(distinct id) >= 70 -- at least 10 trains a day
  on conflict (country, name) do update set lat = excluded.lat, lon = excluded.lon, trains = excluded.trains,
    measured = excluded.measured, on_time = excluded.on_time, late15 = excluded.late15, cancelled = excluded.cancelled,
    avg_delay = excluded.avg_delay, first_day = excluded.first_day, last_day = excluded.last_day, refreshed = excluded.refreshed;
  get diagnostics n = row_count;
  return n;
end $$;

-- Every station page (refreshed in the last 30 days). Left out: stations abroad that a feed lists with a country
-- suffix ("Luxembourg (LU)"), border points, and a station that another country's feed covers with more trains
-- within about 1 km (Bruxelles Midi in the German feed is the Belgian page's station).
create or replace function public.station_page_list()
returns table(country text, name text, trains int, last_day date)
language sql stable security definer set search_path to 'public' as $$
  select s.country, s.name, s.trains, s.last_day from public.station_stats s
  where s.refreshed >= (now() at time zone 'Europe/Paris')::date - 30
    and s.name !~ '\([A-Z]{1,2}\)$' and s.name !~* '(fronti[eè]re|grenze|\mgr\M)'
    and not exists (select 1 from public.station_stats o
                    where o.country <> s.country and o.trains > s.trains and o.refreshed >= (now() at time zone 'Europe/Paris')::date - 30
                      and abs(o.lat - s.lat) < 0.01 and abs(o.lon - s.lon) < 0.015)
  order by 1, 2;
$$;

-- One station: the 7-day figures and today's trains through it, by the clock: yesterday's trains after midnight
-- count as early today, today's trains after midnight belong to tomorrow's page
create or replace function public.station_info(p_country text, p_name text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone case when p_country = 'pt' then 'Europe/Lisbon' else 'Europe/Paris' end)::date as today),
  st as (select * from public.station_stats where country = p_country and name = p_name),
  b as (
    select t.type, t.number, t.origin, t.destination, t.cancelled, (t.rt_updated_at is not null) as live, t.service_date < d.today as y,
           a.e->>'arr' as arr, a.e->>'dep' as dep, a.e->>'pf' as pf, (a.e->>'delay')::int as delay,
           coalesce((a.e->>'skipped')::boolean, false) as sk, coalesce(a.e->>'dep', a.e->>'arr') as tt
    from d, public.trains t, jsonb_array_elements(t.stops) a(e)
    where t.country = p_country and t.service_date in (d.today - 1, d.today)
      and t.stops @> jsonb_build_array(jsonb_build_object('name', p_name)) and a.e->>'name' = p_name
  )
  select jsonb_build_object(
    'country', st.country, 'name', st.name, 'lat', st.lat, 'lon', st.lon, 'trains', st.trains,
    'measured', st.measured, 'on_time', st.on_time, 'late15', st.late15, 'cancelled', st.cancelled, 'avg_delay', st.avg_delay,
    'first_day', st.first_day, 'last_day', st.last_day, 'today', (select today from d),
    'board', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'time', public.hm24(tt), 'arr', public.hm24(arr), 'dep', public.hm24(dep), 'type', type, 'number', number,
        'origin', origin, 'destination', destination, 'pf', pf, 'live', live,
        'delay', case when live then delay end, 'cancelled', cancelled or sk)) order by public.gtfs_secs(tt) - case when y then 86400 else 0 end, number)
      from (select * from b where tt is not null and (split_part(tt, ':', 1)::int >= 24) = y) x), '[]'::jsonb)
  ) from st;
$$;

revoke all on function public.refresh_station_stats() from public, anon, authenticated;
grant execute on function public.station_page_list() to anon, authenticated;
grant execute on function public.station_info(text, text) to anon, authenticated;

-- every night after the archive (archive-days 04:45, route-pairs 04:55)
select cron.schedule('station-stats', '5 5 * * *', 'set statement_timeout = ''120s''; select public.refresh_station_stats();');
