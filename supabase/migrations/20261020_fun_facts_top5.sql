-- 20.10.2026: fun facts become top 5 lists per category, for Europe ("all") and each country.
-- Same rules as before (see 20261020_fun_facts.sql): "best" only where the live feed really reports delays;
-- a station/route never appears in both its best and worst list; twin trains (same run under two numbers) once;
-- trains whose delays are an exact copy of another train on a different route are left out (source error).
-- The page /rekordi shows them; the cards under the map show the first of each list.
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
    tr0 as materialized (
      select country, type, number, count(distinct service_date) days,
        count(distinct service_date) filter (where delay_min >= 5) late_days,
        percentile_cont(0.5) within group (order by delay_min) med, round(avg(delay_min)) avgd,
        mode() within group (order by o) o, mode() within group (order by de) de,
        array_agg(delay_min order by service_date) seq
      from t where obs and number <> '' group by 1, 2, 3),
    -- twins (one run under two numbers, same route) count once; identical delays on different routes mean the
    -- source attached one train's delays to others, so none of them is shown (we cannot tell which is real)
    tr1 as (select distinct on (country, o, de, seq) * from tr0 where days >= 5 and late_days >= 3 order by country, o, de, seq, number),
    tr as materialized (select * from tr1 where not exists (select 1 from tr1 b where b.country = tr1.country and b.seq = tr1.seq and (b.o, b.de) is distinct from (tr1.o, tr1.de))),
    rt as (
      select country, least(o, de) a, greatest(o, de) b, count(*) n, count(distinct service_date) days,
        count(*) filter (where obs) nobs,
        round(100 * avg((delay_min < 5)::int) filter (where obs), 1) ontime,
        round(avg(delay_min) filter (where obs), 1) avgd, avg(sig::int) filter (where obs) sig
      from t where o <> de group by 1, 2, 3),
    -- every record counts for its own country and for Europe ("all")
    st_s as (select v.sc, st.* from st, lateral (values (st.country), ('all')) v(sc) where st.n >= case when v.sc = 'all' then 700 else 350 end),
    tr_s as (select v.sc, tr.* from tr, lateral (values (tr.country), ('all')) v(sc)),
    rt_s as (select v.sc, rt.* from rt, lateral (values (rt.country), ('all')) v(sc)),
    sb as materialized (select * from (select st_s.*, row_number() over (partition by sc order by ontime desc, n desc) r from st_s where sig >= 0.2) x where r <= 5),
    sw as materialized (select * from (select st_s.*, row_number() over (partition by sc order by ontime, avgd desc) r from st_s
      where not exists (select 1 from sb where sb.sc = st_s.sc and sb.country = st_s.country and sb.name = st_s.name)) x where r <= 5),
    tw as materialized (select * from (select tr_s.*, row_number() over (partition by sc order by late_days desc, med desc, avgd desc) r from tr_s) x where r <= 5),
    rb as materialized (select * from (select rt_s.*, round(n / 7.0) per_day, row_number() over (partition by sc order by n desc) r from rt_s) x where r <= 5),
    rbe as materialized (select * from (select rt_s.*, row_number() over (partition by sc order by ontime desc, nobs desc) r from rt_s where nobs >= 35 and days >= 5 and sig >= 0.2) x where r <= 5),
    rw as materialized (select * from (select rt_s.*, row_number() over (partition by sc order by ontime, avgd desc) r from rt_s
      where nobs >= 35 and days >= 5 and not exists (select 1 from rbe where rbe.sc = rt_s.sc and rbe.country = rt_s.country and rbe.a = rt_s.a and rbe.b = rt_s.b)) x where r <= 5),
    sc as (select distinct country c from t union all select 'all')
    select jsonb_build_object(
      'from', (select t - 7 from d), 'to', (select t - 1 from d), 'top', 5,
      'facts', jsonb_object_agg(sc.c, jsonb_strip_nulls(jsonb_build_object(
        'station_best', (select jsonb_agg(jsonb_build_object('country', country, 'name', name, 'n', n, 'ontime', ontime, 'avgd', avgd) order by r) from sb where sb.sc = sc.c),
        'station_worst', (select jsonb_agg(jsonb_build_object('country', country, 'name', name, 'n', n, 'ontime', ontime, 'avgd', avgd) order by r) from sw where sw.sc = sc.c),
        'train_worst', (select jsonb_agg(jsonb_build_object('country', country, 'type', type, 'number', number, 'days', days, 'late_days', late_days, 'med', med, 'avgd', avgd, 'o', o, 'de', de) order by r) from tw where tw.sc = sc.c),
        'route_busy', (select jsonb_agg(jsonb_build_object('country', country, 'a', a, 'b', b, 'n', n, 'per_day', per_day) order by r) from rb where rb.sc = sc.c),
        'route_best', (select jsonb_agg(jsonb_build_object('country', country, 'a', a, 'b', b, 'n', nobs, 'ontime', ontime, 'avgd', avgd) order by r) from rbe where rbe.sc = sc.c),
        'route_worst', (select jsonb_agg(jsonb_build_object('country', country, 'a', a, 'b', b, 'n', nobs, 'ontime', ontime, 'avgd', avgd) order by r) from rw where rw.sc = sc.c)))))
    from sc
  into j;
  insert into public.fun_facts(id, data, updated_at) values (1, j, now())
    on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return jsonb_array_length(jsonb_path_query_array(j, '$.facts.*'));
end $function$;
revoke all on function public.refresh_fun_facts() from public, anon, authenticated;
