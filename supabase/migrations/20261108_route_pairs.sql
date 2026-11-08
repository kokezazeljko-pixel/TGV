-- City-pair route pages (8.11.2026): besides origin → destination of a train, a route page for every pair of the
-- 30 busiest stations of a country that trains serve one after the other (e.g. Paris Gare de Lyon → Lyon Part-Dieu,
-- also for trains that continue to Marseille). Punctuality is measured on arrival at the second station.
-- route_pair_stats holds the last 7 days per pair and train; refresh_route_pairs() rebuilds it every night.

create table if not exists public.route_pair_stats (
  country text not null, a text not null, b text not null, type text not null, number text not null,
  dep text, arr text, runs int, measured int, on_time int, late15 int, cancelled int, avg_delay numeric,
  first_day date, last_day date,
  primary key (country, a, b, type, number)
);
alter table public.route_pair_stats enable row level security; -- read only through the functions below

-- "25:10:00" -> "01:10"
create or replace function public.hm24(t text) returns text language sql immutable as $$
  select case when t ~ '^\d{1,2}:\d{2}' then lpad((split_part(t, ':', 1)::int % 24)::text, 2, '0') || ':' || split_part(t, ':', 2) end;
$$;

create or replace function public.refresh_route_pairs()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare today date := (now() at time zone 'Europe/Paris')::date; n integer;
begin
  create temp table _s on commit drop as
    select t.country, t.id, t.service_date, t.type, coalesce(t.number, '') as number, t.cancelled as tc,
           (t.rt_updated_at is not null) as live, a.o::int as o, a.e->>'name' as name,
           coalesce(a.e->>'dep', a.e->>'arr') as tdep, coalesce(a.e->>'arr', a.e->>'dep') as tarr,
           coalesce((a.e->>'skipped')::boolean, false) as sk, (a.e->>'delay')::int as delay
    from public.trains t, jsonb_array_elements(t.stops) with ordinality as a(e, o)
    where t.service_date between today - 7 and today - 1 and a.e->>'name' is not null;
  create temp table _m on commit drop as
    select country, name from (
      select country, name, row_number() over (partition by country order by count(distinct id) desc) as rk
      from _s group by 1, 2) x
    where rk <= 30;
  create temp table _p on commit drop as
    select x.* from _s x join _m m on m.country = x.country and m.name = x.name;

  delete from public.route_pair_stats;
  insert into public.route_pair_stats
    select a.country, a.name, b.name, a.type, a.number,
           (array_agg(public.hm24(a.tdep) order by a.service_date desc))[1],
           (array_agg(public.hm24(b.tarr) order by a.service_date desc))[1],
           count(*),
           count(*) filter (where a.live and not (a.tc or a.sk or b.sk)),
           count(*) filter (where a.live and not (a.tc or a.sk or b.sk) and coalesce(b.delay, 0) <= 5),
           count(*) filter (where a.live and not (a.tc or a.sk or b.sk) and coalesce(b.delay, 0) >= 15),
           count(*) filter (where a.tc or a.sk or b.sk),
           round(avg(coalesce(b.delay, 0)) filter (where a.live and not (a.tc or a.sk or b.sk)), 1),
           min(a.service_date), max(a.service_date)
    from _p a join _p b on a.id = b.id and a.o < b.o and a.name <> b.name
    group by 1, 2, 3, 4, 5
    on conflict do nothing;
  delete from public.route_pair_stats p
   using (select country, a, b from public.route_pair_stats group by 1, 2, 3 having sum(runs) < 3) x
   where p.country = x.country and p.a = x.a and p.b = x.b;
  select count(*) into n from (select distinct country, a, b from public.route_pair_stats) y;
  return n;
end $$;

-- Every route address: origin → destination routes (kind 'od') and the city pairs (kind 'pair')
create or replace function public.route_list_all()
returns table(country text, origin text, destination text, runs int, last_day date, kind text)
language sql stable security definer set search_path to 'public' as $$
  select * from (
    select r.country, r.origin, r.destination, r.runs, r.last_day, 'od'::text as kind from public.route_page_list() r
    union all
    select p.country, p.a, p.b, sum(p.runs)::int, max(p.last_day), 'pair' from public.route_pair_stats p group by 1, 2, 3
  ) x order by 1, 2, 3, 6;
$$;

-- One city pair, in the same shape as route_page_info (plus pair: true)
create or replace function public.route_pair_info(p_country text, p_a text, p_b text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with w as (select * from public.route_pair_stats where country = p_country and a = p_a and b = p_b)
  select jsonb_build_object(
    'country', p_country, 'origin', p_a, 'destination', p_b, 'pair', true,
    'first_day', (select min(first_day) from w), 'last_day', (select max(last_day) from w),
    'runs', (select sum(runs) from w), 'measured', (select sum(measured) from w), 'on_time', (select sum(on_time) from w),
    'late15', (select sum(late15) from w), 'cancelled', (select sum(cancelled) from w),
    'avg_delay', (select round(sum(avg_delay * measured) / nullif(sum(measured) filter (where avg_delay is not null), 0), 1) from w),
    'trains', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'number', number, 'dep', dep, 'arr', arr,
                         'measured', measured, 'on_time', on_time, 'cancelled', cancelled, 'avg_delay', avg_delay) order by dep, number) from w), '[]'::jsonb)
  )
  where exists (select 1 from w);
$$;

revoke all on function public.refresh_route_pairs() from public, anon, authenticated;
grant execute on function public.route_list_all() to anon, authenticated;
grant execute on function public.route_pair_info(text, text, text) to anon, authenticated;

-- every night after the archive (archive-days runs at 04:45)
select cron.schedule('route-pairs', '55 4 * * *', 'set statement_timeout = ''120s''; select public.refresh_route_pairs();');
