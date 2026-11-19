-- The route and station lists in ONE call each (19.11.2026). The route list (6,000+ rows) used to be read in pages
-- of 1000; each page re-ran route_list_all, and when one hit the statement timeout (17.11, twice) the server kept
-- a partial list for an hour and those route pages answered 404 to Google. lib/listcache.js reads these instead.
create or replace function public.route_list_json()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_array(country, origin, destination, runs, last_day, kind) order by country, origin, destination, kind), '[]'::jsonb) from public.route_list_all();
$$;
create or replace function public.station_page_json()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_array(country, name, trains, last_day) order by country, name), '[]'::jsonb) from public.station_page_list();
$$;
grant execute on function public.route_list_json() to anon, authenticated;
grant execute on function public.station_page_json() to anon, authenticated;
