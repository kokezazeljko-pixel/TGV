-- Sitemap (12.11.2026): only trains that ran on at least 2 days of the last week; one-off trains stay out
-- (their pages still work while they are in the 7-day window).
CREATE OR REPLACE FUNCTION public.train_page_list()
 RETURNS TABLE(country text, type text, number text, last_day date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select t.country, t.type, t.number, max(t.service_date)
  from public.trains t
  where t.service_date >= (now() at time zone 'Europe/Paris')::date - 7
    and coalesce(t.number, '') ~ '^[0-9]+$'
  group by 1, 2, 3
  having count(distinct t.service_date) >= 2
  order by 1, 2, 3;
$function$;
