-- Route pages for search engines (/route/<country>/<from>--<to>, 4.11.2026): every origin → destination pair
-- of our trains, with the trains on it and their punctuality over the last 7 days (totals only).

-- Routes that ran in the last 7 days (archive) or run today/tomorrow, with at least 3 runs.
create or replace function public.route_page_list()
returns table(country text, origin text, destination text, runs int, last_day date)
language sql stable security definer set search_path to 'public' as $function$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  r as (
    select t.country, t.origin, t.destination, t.service_date from public.train_daily t, d
      where t.service_date between d.today - 7 and d.today - 1
    union all
    select t.country, t.origin, t.destination, t.service_date from public.trains t, d
      where t.service_date between d.today and d.today + 1
  )
  select r.country, r.origin, r.destination, count(*)::int, max(r.service_date)
  from r where r.origin is not null and r.destination is not null and r.origin <> r.destination
  group by 1, 2, 3 having count(*) >= 3
  order by 1, 2, 3;
$function$;

-- One route: totals of the last 7 days and one line per train (number) with its own totals and timetable.
create or replace function public.route_page_info(p_country text, p_origin text, p_destination text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  w as (
    select * from public.train_daily t, d
    where t.country = p_country and t.origin = p_origin and t.destination = p_destination
      and t.service_date between d.today - 7 and d.today - 1
  ),
  plan as (  -- timetable from today/tomorrow, else from the archive
    select distinct on (x.type, x.number) x.type, x.number, x.dep, x.arr
    from (
      select t.type, coalesce(t.number, '') number, t.dep, t.arr, t.service_date from public.trains t, d
        where t.country = p_country and t.origin = p_origin and t.destination = p_destination
          and t.service_date between d.today and d.today + 1
      union all
      select w.type, w.number, w.dep, w.arr, w.service_date from w
    ) x
    order by x.type, x.number, x.service_date desc
  ),
  per as (
    select p.type, p.number, p.dep, p.arr,
           count(w.*) filter (where w.live and not w.cancelled) measured,
           count(w.*) filter (where w.live and not w.cancelled and coalesce(w.delay_min, 0) <= 5) on_time,
           count(w.*) filter (where w.cancelled) cancelled,
           round(avg(coalesce(w.delay_min, 0)) filter (where w.live and not w.cancelled), 1) avg_delay
    from plan p left join w on w.type = p.type and w.number = p.number
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'country', p_country, 'origin', p_origin, 'destination', p_destination,
    'first_day', (select min(service_date) from w), 'last_day', (select max(service_date) from w),
    'runs', (select count(*) from w),
    'measured', (select count(*) from w where live and not cancelled),
    'on_time', (select count(*) from w where live and not cancelled and coalesce(delay_min, 0) <= 5),
    'late15', (select count(*) from w where live and not cancelled and coalesce(delay_min, 0) >= 15),
    'cancelled', (select count(*) from w where cancelled),
    'avg_delay', (select round(avg(coalesce(delay_min, 0)), 1) from w where live and not cancelled),
    'trains', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'number', number, 'dep', dep, 'arr', arr,
                         'measured', measured, 'on_time', on_time, 'cancelled', cancelled, 'avg_delay', avg_delay) order by dep, number) from per), '[]'::jsonb)
  )
  where exists (select 1 from plan);
$function$;

grant execute on function public.route_page_list() to anon, authenticated;
grant execute on function public.route_page_info(text, text, text) to anon, authenticated;
