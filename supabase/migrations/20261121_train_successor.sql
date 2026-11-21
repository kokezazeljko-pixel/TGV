-- Renumbered trains (21.11.2026): ICE 1254 München 14:20 → Amsterdam ran 10–16.11 and the same departure has run as
-- ICE 224 since 17.11, but Google still sends people to the ICE 1254 page. train_successor() finds, for a number that
-- has not run for 3+ days, the same departure (country, type, origin, departure time) under another number on at
-- least 2 days after it, never on a day this number ran (that would be two trains); the train page links to it.
create or replace function public.train_successor(p_country text, p_type text, p_number text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with d as (select (now() at time zone 'Europe/Paris')::date as today),
  mine as (
    select t.service_date, t.origin, t.dep from public.train_daily t, d
     where t.country = p_country and t.number = p_number and t.type = p_type and t.service_date >= d.today - 60
    union all
    select t.service_date, t.origin, t.dep from public.trains t, d
     where t.country = p_country and t.number = p_number and t.type = p_type and t.service_date between d.today and d.today + 1
  ),
  last as (select max(service_date) as last_day from mine),
  ref as (select origin, dep from mine order by service_date desc limit 1),
  later as (
    select t.service_date, t.type, t.number, t.origin, t.dep from public.train_daily t, last
     where t.country = p_country and t.service_date > last.last_day
    union all
    select t.service_date, t.type, t.number, t.origin, t.dep from public.trains t, last, d
     where t.country = p_country and t.service_date between d.today and d.today + 1 and t.service_date > last.last_day
  ),
  cand as (
    select l.type, l.number, min(l.service_date) as first_day, count(distinct l.service_date) as days
    from later l, ref
    where l.type = p_type and coalesce(l.number, '') not in ('', p_number) and l.origin = ref.origin and l.dep = ref.dep
    group by 1, 2
  )
  -- the same departure (origin and time) under another number, on at least 2 days after this number's last run,
  -- and never on the same day as this number (then they would be two different trains)
  select jsonb_build_object('type', c.type, 'number', c.number, 'first_day', c.first_day, 'last_day', last.last_day)
  from cand c, last, d, ref
  where last.last_day < d.today - 2 and c.days >= 2
    and not exists (select 1 from public.train_daily x
                     where x.country = p_country and x.type = c.type and x.number = c.number and x.origin = ref.origin and x.dep = ref.dep
                       and x.service_date in (select service_date from mine))
  order by c.days desc, c.first_day
  limit 1;
$$;
grant execute on function public.train_successor(text, text, text) to anon, authenticated;
