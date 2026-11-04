-- For the share image of a train page: one colour class per day of the last 7 full days, never the minutes
-- (day-by-day delays stay a paid extra). k: 'ok' up to 5 min, 'warn' 6–14 min, 'bad' 15+ min, 'x' cancelled, '-' no live data.
create or replace function public.train_week_days(p_country text, p_type text, p_number text)
returns table(day date, k text)
language sql stable security definer set search_path to 'public' as $function$
  with d as (select (now() at time zone 'Europe/Paris')::date as today)
  select t.service_date,
         case when bool_or(t.cancelled) then 'x'
              when not bool_or(t.rt_updated_at is not null) then '-'
              when max(coalesce(t.delay_min, 0)) <= 5 then 'ok'
              when max(coalesce(t.delay_min, 0)) < 15 then 'warn'
              else 'bad' end
  from public.trains t, d
  where t.number = p_number and t.country = p_country and t.type = p_type
    and t.service_date between d.today - 7 and d.today - 1
  group by t.service_date
  order by t.service_date;
$function$;
grant execute on function public.train_week_days(text, text, text) to anon, authenticated;
