-- 20.10.2026: "Fun facts" for the last 7 full days (free for everyone).
-- Computed once a day into one small row; the site only reads that row (get_fun_facts).
-- Measured before switching on: ~2.3 s, no temporary files on disk.
-- Safeguards as for the board cache: enough work_mem, a time limit, never two at once.
-- "Best" station/route only where the live feed really reports delays (>= 20% of trains with
-- some deviation), so a line without live data (zeros only) can never "win".
create table if not exists public.fun_facts (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fun_facts enable row level security;

create or replace function public.refresh_fun_facts()
 returns integer language plpgsql security definer
 set search_path to 'public' set work_mem to '128MB' set statement_timeout to '60s'
as $function$
declare j jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh_fun_facts')) then return -1; end if;
    with d as (select (now() at time zone 'Europe/Paris')::date t),
    t as (
      select country, type, number, service_date, delay_min, stops,
        regexp_replace(origin, ' Hall \d.*$', '') o, regexp_replace(destination, ' Hall \d.*$', '') de,
        (rt_updated_at is not null and not cancelled) obs,
        exists (select 1 from jsonb_array_elements(stops) s where coalesce((s->>'delay')::int, 0) <> 0) sig
      from trains, d where service_date between d.t - 7 and d.t - 1),
    st as (
      select t.country, regexp_replace(s->>'name', ' Hall \d.*$', '') name, count(*) n,
        round(100 * avg((coalesce((s->>'delay')::int, 0) < 5)::int), 1) ontime,
        round(avg(coalesce((s->>'delay')::int, 0)), 1) avgd, avg(t.sig::int) sig
      from t, jsonb_array_elements(t.stops) s
      where t.obs and not coalesce((s->>'skipped')::boolean, false)
      group by 1, 2),
    tr as materialized (
      select country, type, number, count(distinct service_date) days,
        count(distinct service_date) filter (where delay_min >= 5) late_days,
        percentile_cont(0.5) within group (order by delay_min) med, round(avg(delay_min)) avgd,
        mode() within group (order by o) o, mode() within group (order by de) de
      from t where obs and number <> '' group by 1, 2, 3),
    rt as (
      select country, least(o, de) a, greatest(o, de) b, count(*) n, count(distinct service_date) days,
        count(*) filter (where obs) nobs,
        round(100 * avg((delay_min < 5)::int) filter (where obs), 1) ontime,
        round(avg(delay_min) filter (where obs), 1) avgd, avg(sig::int) filter (where obs) sig
      from t where o <> de group by 1, 2, 3),
    sc as (select distinct country c from t union all select 'all')
    select jsonb_build_object(
      'from', (select t - 7 from d), 'to', (select t - 1 from d),
      'facts', jsonb_object_agg(sc.c, jsonb_strip_nulls(jsonb_build_object(
        'station_best', to_jsonb(sb), 'station_worst', to_jsonb(sw), 'train_worst', to_jsonb(tw),
        'route_busy', to_jsonb(rb), 'route_best', to_jsonb(rbe), 'route_worst', to_jsonb(rw)))))
    from sc
    left join lateral (select country, name, n, ontime, avgd from st
      where (sc.c = 'all' or country = sc.c) and n >= case when sc.c = 'all' then 700 else 350 end and sig >= 0.2
      order by ontime desc, n desc limit 1) sb on true
    left join lateral (select country, name, n, ontime, avgd from st
      where (sc.c = 'all' or country = sc.c) and n >= case when sc.c = 'all' then 700 else 350 end
        and (sb.name is null or name <> sb.name or country <> sb.country)
      order by ontime, avgd desc limit 1) sw on true
    left join lateral (select country, type, number, days, late_days, med, avgd, o, de from tr
      where (sc.c = 'all' or country = sc.c) and days >= 5 and late_days >= 3
      order by late_days desc, med desc, avgd desc limit 1) tw on true
    left join lateral (select country, a, b, n, round(n / 7.0) per_day from rt
      where (sc.c = 'all' or country = sc.c) order by n desc limit 1) rb on true
    left join lateral (select country, a, b, nobs n, ontime, avgd from rt
      where (sc.c = 'all' or country = sc.c) and nobs >= 35 and days >= 5 and sig >= 0.2
      order by ontime desc, nobs desc limit 1) rbe on true
    left join lateral (select country, a, b, nobs n, ontime, avgd from rt
      where (sc.c = 'all' or country = sc.c) and nobs >= 35 and days >= 5
        and (rbe.a is null or a <> rbe.a or b <> rbe.b)
      order by ontime, avgd desc limit 1) rw on true
  into j;
  insert into public.fun_facts(id, data, updated_at) values (1, j, now())
    on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return jsonb_array_length(jsonb_path_query_array(j, '$.facts.*'));
end $function$;
revoke all on function public.refresh_fun_facts() from public, anon, authenticated;

create or replace function public.get_fun_facts()
 returns jsonb language sql stable security definer set search_path to 'public'
as $$ select data || jsonb_build_object('updated_at', updated_at) from public.fun_facts where id = 1 $$;
revoke all on function public.get_fun_facts() from public;
grant execute on function public.get_fun_facts() to anon, authenticated;

-- once a day at 11:23 UTC (13:23 in Paris), after the night trains of the day before have arrived;
-- created switched off, switched on only after one manual run is measured
select cron.schedule('fun-facts', '23 11 * * *', $$set statement_timeout = '60s'; select public.refresh_fun_facts();$$);
select cron.alter_job((select jobid from cron.job where jobname = 'fun-facts'), active := false);
