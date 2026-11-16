-- City-pair route pages, stable list (16.11.2026): a station stays among the "busy stations" for 30 days after it was
-- last among the 30 busiest of its country, so stations around rank 30 (e.g. Bremen Hbf) or ones bypassed by works
-- for a week (Essen Hbf) do not make their pages appear and disappear (Google saw those as "Not found (404)").
create table if not exists public.route_pair_stations (country text not null, name text not null, last_top date not null, primary key (country, name));
alter table public.route_pair_stations enable row level security;

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
  insert into public.route_pair_stations
    select country, name, today from (
      select country, name, row_number() over (partition by country order by count(distinct id) desc) as rk
      from _s group by 1, 2) x
    where rk <= 30
  on conflict (country, name) do update set last_top = excluded.last_top;
  create temp table _p on commit drop as
    select x.* from _s x join public.route_pair_stations m on m.country = x.country and m.name = x.name and m.last_top >= today - 30;

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
revoke all on function public.refresh_route_pairs() from public, anon, authenticated;
