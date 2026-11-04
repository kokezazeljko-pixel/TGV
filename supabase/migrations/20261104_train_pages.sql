-- Train pages for search engines (/train/<country>/<type>-<number>) and the new prices (4.11.2026).

-- 1) Prices: €1 = 1 day, from €4 = 30 days (monthly Ko-fi membership: 31 days), from €29 = 365 days.
create or replace function public.kofi_grant(p_tx text, p_email text, p_amount numeric, p_currency text, p_kind text)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare uid uuid; new_until timestamptz; days int; amt numeric := coalesce(p_amount, 0);
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  insert into public.kofi_payments (tx_id, email, amount, currency, kind, user_id)
    values (p_tx, lower(trim(p_email)), p_amount, p_currency, p_kind, uid)
    on conflict (tx_id) do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  days := case
    when amt >= 29 then 365
    when amt >= 4 and lower(coalesce(p_kind, '')) = 'subscription' then 31
    when amt >= 4 then 30
    else floor(amt)::int
  end;
  if uid is null or days < 1 then return jsonb_build_object('granted', false, 'user', uid is not null, 'days', days); end if;
  insert into public.history_access as h (user_id, until) values (uid, now() + make_interval(days => days))
    on conflict (user_id) do update set until = greatest(h.until, now()) + make_interval(days => days)
    returning until into new_until;
  return jsonb_build_object('granted', true, 'days', days, 'until', new_until);
end $function$;

-- 2) Short public summary of one train over the last 7 days (yesterday and the 6 days before).
--    Only totals – the day-by-day details stay a paid extra (table rows of earlier days are not public).
create or replace function public.train_week_summary(p_country text, p_type text, p_number text)
returns table(runs int, live_runs int, on_time int, late15 int, cancelled int, avg_delay numeric, max_delay int, first_day date, last_day date)
language sql stable security definer set search_path to 'public' as $function$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  r as (
    select t.service_date, t.delay_min, t.cancelled, t.rt_updated_at
    from public.trains t, d
    where t.number = p_number and t.country = p_country and t.type = p_type
      and t.service_date between d.today - 7 and d.today - 1
  )
  select count(*)::int,
         count(*) filter (where rt_updated_at is not null)::int,
         count(*) filter (where rt_updated_at is not null and not coalesce(cancelled, false) and coalesce(delay_min, 0) <= 5)::int,
         count(*) filter (where rt_updated_at is not null and not coalesce(cancelled, false) and coalesce(delay_min, 0) >= 15)::int,
         count(*) filter (where coalesce(cancelled, false))::int,
         round(avg(coalesce(delay_min, 0)) filter (where rt_updated_at is not null and not coalesce(cancelled, false)), 1),
         max(coalesce(delay_min, 0)) filter (where rt_updated_at is not null and not coalesce(cancelled, false))::int,
         min(service_date), max(service_date)
  from r;
$function$;

-- 3) Every train (country, type, number) that ran in the last 7 days or runs today/tomorrow: the sitemap's train pages.
create or replace function public.train_page_list()
returns table(country text, type text, number text, last_day date)
language sql stable security definer set search_path to 'public' as $function$
  select t.country, t.type, t.number, max(t.service_date)
  from public.trains t
  where t.service_date >= (now() at time zone 'Europe/Paris')::date - 7
    and coalesce(t.number, '') ~ '^[0-9]+$'
  group by 1, 2, 3
  order by 1, 2, 3;
$function$;

grant execute on function public.train_week_summary(text, text, text) to anon, authenticated;
grant execute on function public.train_page_list() to anon, authenticated;

-- 4) Timetable of one train number for its page: the latest run of each type in the last 7 days or today/tomorrow.
--    Only the plan (stations and planned times) – no delays.
create or replace function public.train_page_info(p_country text, p_number text)
returns table(type text, origin text, destination text, dep text, arr text, stops jsonb, last_day date)
language sql stable security definer set search_path to 'public' as $function$
  select distinct on (t.type) t.type, t.origin, t.destination, t.dep, t.arr,
    (select jsonb_agg(jsonb_build_object('name', s->>'name', 'time', s->>'time') order by o) from jsonb_array_elements(t.stops) with ordinality a(s, o)),
    t.service_date
  from public.trains t
  where t.number = p_number and t.country = p_country
    and t.service_date between (now() at time zone 'Europe/Paris')::date - 7 and (now() at time zone 'Europe/Paris')::date + 1
  order by t.type, t.service_date desc;
$function$;
grant execute on function public.train_page_info(text, text) to anon, authenticated;
