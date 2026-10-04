-- Peron: baza podataka
-- Nalepi ceo ovaj fajl u Supabase → SQL Editor → New query → Run.
-- Može da se pokrene više puta bez greške.

-- ============ VOZOVI (puni ih skripta iz foldera ingest/) ============
create table if not exists public.trains (
  id            text primary key,          -- "<datum>_<trip_id>"
  trip_id       text not null,
  service_date  date not null,
  number        text not null,             -- broj voza, npr. 6611
  type          text not null,             -- TGV INOUI, OUIGO, TGV Lyria
  origin        text not null,
  destination   text not null,
  dep           text not null,             -- "HH:MM" po redu vožnje
  arr           text not null,
  delay_min     integer not null default 0,
  cancelled     boolean not null default false,
  stops         jsonb not null default '[]',
  rt_updated_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists trains_date_idx on public.trains (service_date, dep);
create index if not exists trains_number_idx on public.trains (number);
-- Zemlja: fr = Francuska (SNCF), ch = Švajcarska (opentransportdata.swiss)
alter table public.trains add column if not exists country text not null default 'fr' check (country in ('fr','ch'));
create index if not exists trains_country_date_idx on public.trains (country, service_date, dep);

alter table public.trains enable row level security;
drop policy if exists "Svi mogu da čitaju vozove" on public.trains;
create policy "Svi mogu da čitaju vozove" on public.trains for select using (true);
-- Upis je dozvoljen samo service ključu (skripta), koji zaobilazi RLS.

-- Skripta za kašnjenja šalje više vozova odjednom
create or replace function public.apply_rt_updates(payload jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with u as (
    select * from jsonb_to_recordset(payload) as x(id text, delay_min integer, cancelled boolean, stops jsonb)
  ), upd as (
    update public.trains t
       set delay_min = u.delay_min, cancelled = u.cancelled, stops = u.stops, rt_updated_at = now()
      from u where t.id = u.id
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.apply_rt_updates(jsonb) from public, anon, authenticated;
grant execute on function public.apply_rt_updates(jsonb) to service_role;

-- ============ PROFILI (ime koje se prikazuje uz komentar) ============
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Svako vidi svoj profil" on public.profiles;
create policy "Svako vidi svoj profil" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Svako menja svoj profil" on public.profiles;
create policy "Svako menja svoj profil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Novi korisnik automatski dobija profil "Putnik xxxx"; ime menja na stranici Prijava
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Putnik ' || substr(replace(new.id::text, '-', ''), 1, 4))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ KOMENTARI PUTNIKA ============
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  train_id     text not null,              -- konkretna vožnja (datum + voz)
  train_number text not null,
  service_date date not null,
  route_key    text not null,              -- "Polazna – Krajnja", za ocenu linije
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  kind         text not null check (kind in ('razlog', 'utisak')),
  reason       text check (reason is null or char_length(reason) <= 60),
  rating       smallint check (rating between 1 and 5),
  body         text not null default '' check (char_length(body) <= 600),
  onboard      boolean not null default false,
  anon         boolean not null default false,
  created_at   timestamptz not null default now(),
  check (char_length(body) > 0 or reason is not null or rating is not null)
);
create index if not exists comments_train_idx on public.comments (train_id, created_at desc);
create index if not exists comments_route_idx on public.comments (route_key, created_at desc);

alter table public.comments enable row level security;
-- Direktno iz tabele svako vidi samo svoje komentare; svi ostali čitaju preko pogleda comments_feed
drop policy if exists "Svoji komentari" on public.comments;
create policy "Svoji komentari" on public.comments for select using (auth.uid() = user_id);
drop policy if exists "Prijavljeni pišu komentare" on public.comments;
create policy "Prijavljeni pišu komentare" on public.comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Brisanje svojih komentara" on public.comments;
create policy "Brisanje svojih komentara" on public.comments for delete using (auth.uid() = user_id);

-- Zaštita od spama: najviše jedan komentar na 20 sekundi po korisniku
create or replace function public.comments_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '20 seconds') then
    raise exception 'Sačekaj malo pre sledećeg komentara.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- Javni prikaz komentara: anonimni komentari ne otkrivaju ime ni korisnika
create or replace view public.comments_feed as
select c.id, c.train_id, c.train_number, c.service_date, c.route_key, c.kind, c.reason, c.rating,
       c.body, c.onboard, c.created_at,
       case when c.anon then null else p.display_name end as author_name,
       (c.user_id = auth.uid()) as is_mine
  from public.comments c
  left join public.profiles p on p.id = c.user_id;
grant select on public.comments_feed to anon, authenticated;

-- ============ PRAVA PRISTUPA ZA API ============
grant usage on schema public to anon, authenticated;
grant select on public.trains to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.comments to authenticated;
