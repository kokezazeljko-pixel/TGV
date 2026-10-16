-- The home page's trains as a ready compact copy (same form as lib/pack.js), made once a minute by pg_cron.
-- The page on Vercel no longer carries the trains; the browser downloads this copy (get_board) right away.
-- Already applied in Supabase on 2026-10-16 (migrations board_pack, board_cache_refresh; cron job "board-cache").
create table if not exists public.board_cache (day date primary key, data json not null, trains integer not null, updated_at timestamptz not null default now());
alter table public.board_cache enable row level security;

create or replace function public.board_pack(p_day date, p_mod integer default 0)
returns json language sql stable security definer set search_path to 'public' as $$
  with t as (
    select * from public.trains
    where service_date = p_day and (p_mod = 0 or abs(hashtext(id)) % p_mod = 0)
  ),
  s as (
    select t.id, a.o, a.e, jsonb_build_array(a.e->'name', a.e->'lat', a.e->'lon') as k
    from t, jsonb_array_elements(t.stops) with ordinality a(e, o)
  ),
  st as (
    select k, (row_number() over (order by min(id), min(o)) - 1)::int as i from s group by k
  ),
  ps as (
    select s.id, s.o, st.i, s.e->'time' as tm,
      coalesce(case when jsonb_typeof(s.e->'delay') = 'number' then s.e->'delay' end, '0'::jsonb) as dl,
      coalesce(nullif(s.e->>'pf', ''), substring(s.e->>'id' from '^gs:nmbssncb:\d{7}_(\d{1,3}[A-Z]{0,2})$')) as pf,
      nullif(s.e->>'apf', '') as apf
    from s join st using (k)
  ),
  stops as (
    select id, json_agg(case
        when apf is not null then json_build_array(i, tm, dl, pf, apf)
        when pf is not null then json_build_array(i, tm, dl, pf)
        when dl <> '0'::jsonb then json_build_array(i, tm, dl)
        else json_build_array(i, tm) end order by o) as a
    from ps group by id
  )
  select json_build_object(
    'day', p_day,
    'stations', (select coalesce(json_agg(k order by i), '[]'::json) from st),
    'trains', (select coalesce(json_agg(json_build_array(
        case when t.id like p_day::text || '\_%' then substr(t.id, length(p_day::text) + 2) else '!' || t.id end,
        t.number, t.type, t.origin, t.destination, t.dep, t.arr, t.delay_min, case when t.cancelled then 1 else 0 end,
        t.rt_updated_at, t.country, coalesce(stops.a, '[]'::json)) order by t.dep, t.id), '[]'::json)
      from t left join stops on stops.id = t.id)
  );
$$;
revoke all on function public.board_pack(date, integer) from public, anon, authenticated;

create or replace function public.refresh_board_cache()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare d date := (now() at time zone 'Europe/Paris')::date; p json; n integer;
begin
  p := public.board_pack(d);
  n := json_array_length(p->'trains');
  insert into public.board_cache(day, data, trains, updated_at) values (d, p, n, now())
    on conflict (day) do update set data = excluded.data, trains = excluded.trains, updated_at = excluded.updated_at;
  return n;
end $$;
revoke all on function public.refresh_board_cache() from public, anon, authenticated;

-- What the browser asks for: the ready copy of a day (null when there is none or it is stale: then the page reads the trains itself)
create or replace function public.get_board(p_day date)
returns json language sql stable security definer set search_path to 'public' as $$
  select data from public.board_cache where day = p_day and updated_at > now() - interval '10 minutes';
$$;
revoke all on function public.get_board(date) from public;
grant execute on function public.get_board(date) to anon, authenticated;

select cron.schedule('board-cache', '* * * * *', 'select public.refresh_board_cache()');
