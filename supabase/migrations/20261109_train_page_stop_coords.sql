-- Train pages show the route on a map (9.11.2026): the stops of train_page_info also carry their coordinates.
CREATE OR REPLACE FUNCTION public.train_page_info(p_country text, p_number text)
 RETURNS TABLE(type text, origin text, destination text, dep text, arr text, stops jsonb, last_day date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select distinct on (t.type) t.type, t.origin, t.destination, t.dep, t.arr,
    (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', s->>'name', 'time', s->>'time', 'lat', s->'lat', 'lon', s->'lon')) order by o) from jsonb_array_elements(t.stops) with ordinality a(s, o)),
    t.service_date
  from public.trains t
  where t.number = p_number and t.country = p_country
    and t.service_date between (now() at time zone 'Europe/Paris')::date - 7 and (now() at time zone 'Europe/Paris')::date + 1
  order by t.type, t.service_date desc;
$function$;
