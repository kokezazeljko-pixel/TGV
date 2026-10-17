-- 17.10.2026: the board cache refresh wrote ~60 MB of temporary files to disk every minute.
-- That used up the database's daily disk budget and the whole database slowed down
-- (all cron jobs failed from 06:40 to 11:44 Paris time). Safeguards:
--  * enough memory (work_mem) so the packing runs in memory instead of on disk,
--  * never two refreshes at once (advisory lock: a refresh that finds one still running just skips),
--  * a 30 s time limit in the cron command, so a slow refresh can never hold the database,
--  * every 2 minutes instead of every minute.
alter function public.board_pack(date, integer) set work_mem = '128MB';

create or replace function public.refresh_board_cache()
 returns integer language plpgsql security definer
 set search_path to 'public' set work_mem to '128MB' set statement_timeout to '30s'
as $function$
declare d date := (now() at time zone 'Europe/Paris')::date; p json; n integer;
begin
  -- never two at once: if the previous refresh is still running, skip this turn
  if not pg_try_advisory_xact_lock(hashtext('refresh_board_cache')) then return -1; end if;
  p := public.board_pack(d);
  n := json_array_length(p->'trains');
  insert into public.board_cache(day, data, trains, updated_at) values (d, p, n, now())
    on conflict (day) do update set data = excluded.data, trains = excluded.trains, updated_at = excluded.updated_at;
  return n;
end $function$;

select cron.alter_job((select jobid from cron.job where jobname = 'board-cache'),
  schedule := '*/2 * * * *',
  command := $$set statement_timeout = '30s'; select public.refresh_board_cache();$$);
-- the job is switched on (active := true) only after one manual run is measured: under 5 s and no temp files
