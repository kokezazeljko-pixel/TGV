-- The site asks every minute for "trains of today changed since X" (service_date + rt_updated_at).
-- Without this index the database read all ~7000 trains of the day each time (over 1 s, sometimes
-- over the 3 s limit -> "Couldn't load data: canceling statement due to statement timeout").
-- With it the query takes ~20 ms. Already applied in Supabase on 2026-10-09.
create index if not exists trains_rt_updated_idx on public.trains (service_date, rt_updated_at);
