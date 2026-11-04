-- Punctuality of the last 7 full days by country and train type (from the archive train_daily), for /rekordi.
-- "On time" = at most 5 minutes late at the last stop (like the railways' own "under 6 minutes").
-- measured = trains that ran and had live data (the base of on_time, late15 and avg_delay).
create or replace function public.punctuality_week()
returns table(country text, type text, planned int, live int, measured int, on_time int, late15 int, cancelled int, avg_delay numeric, first_day date, last_day date)
language sql stable security definer set search_path to 'public' as $function$
  with d as (select (now() at time zone 'Europe/Paris')::date as today)
  select t.country, t.type,
         count(*)::int,
         count(*) filter (where t.live)::int,
         count(*) filter (where t.live and not t.cancelled)::int,
         count(*) filter (where t.live and not t.cancelled and coalesce(t.delay_min, 0) <= 5)::int,
         count(*) filter (where t.live and not t.cancelled and coalesce(t.delay_min, 0) >= 15)::int,
         count(*) filter (where t.cancelled)::int,
         round(avg(coalesce(t.delay_min, 0)) filter (where t.live and not t.cancelled), 2),
         min(t.service_date), max(t.service_date)
  from public.train_daily t, d
  where t.service_date between d.today - 7 and d.today - 1
  group by 1, 2;
$function$;
grant execute on function public.punctuality_week() to anon, authenticated;
-- (A first version, punctuality_compare(), was created the same day and is not used; it can be dropped.)
