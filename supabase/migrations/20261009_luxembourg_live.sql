-- Luksemburg uživo (mobiliteit.lu): već primenjeno na bazu, ovde stoji kao zapis.
-- Ključ LU_API_KEY stoji SAMO u Supabase -> Edge Functions -> Secrets. Kašnjenja radi Edge funkcija sync-lu.

-- polasci sa stanica (iz table polazaka API-ja), po broju voza, stanici i planiranom vremenu
create table if not exists public.lu_rt (
  num text not null,
  ext text not null,           -- broj stanice u API-ju (200405060 = Luxembourg, Gare Centrale)
  pt timestamptz not null,     -- planirani polazak
  ct timestamptz,              -- očekivani/stvarni polazak
  cancelled boolean not null default false,
  pf text, pf_plan text,       -- peron sada / po planu
  updated_at timestamptz not null default now(),
  primary key (num, ext, pt)
);
alter table public.lu_rt enable row level security; -- samo server (service role) čita i piše

create or replace function public.call_sync_lu() returns bigint language sql security definer set search_path to 'public','extensions' as $$
  select net.http_post(
    url := 'https://yrmjlkpeqaqownzhutyi.supabase.co/functions/v1/sync-lu',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='rt_cron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$;
revoke all on function public.call_sync_lu() from public, anon, authenticated;

select cron.schedule('lu-rt', '* * * * *', $$select public.call_sync_lu()$$);
