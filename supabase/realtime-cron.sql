-- Automatsko osvežavanje kašnjenja (već podešeno u bazi; ovde samo za dokumentaciju).
-- pg_cron na svakih 3 minuta poziva Edge funkciju "sync-realtime" za Francusku, a minut kasnije za Švajcarsku.
-- Funkcija traži tajni žeton koji se čuva u Vault-u (rt_cron_token) i nikad ne izlazi iz baze.
-- Švajcarskoj treba i ključ SWISS_API_KEY u Supabase → Edge Functions → Secrets.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'rt_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'rt_cron_token', 'Token pg_cron uses to call the sync-realtime edge function');
  end if;
end $$;

create or replace function public.call_sync_realtime(p_country text)
returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-realtime?country=' || p_country,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'rt_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.call_sync_realtime(text) from public, anon, authenticated;

select cron.schedule('rt-fr', '*/3 * * * *', $$select public.call_sync_realtime('fr')$$);
select cron.schedule('rt-ch', '1-59/3 * * * *', $$select public.call_sync_realtime('ch')$$);
select cron.schedule('rt-be', '2-59/3 * * * *', $$select public.call_sync_realtime('be')$$);

-- Provera poslednjih poziva:
--   select id, status_code, left(content::text, 300) from net._http_response order by id desc limit 10;
