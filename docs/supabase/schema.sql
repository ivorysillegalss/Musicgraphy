create extension if not exists postgis;

create table if not exists public.artist_geo_cache (
  artist_id text primary key,
  artist_name text not null,
  country_code text,
  country_name text,
  city_name text,
  coordinates geography(point, 4326),
  raw_payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_mbid text,
  album_title text not null,
  release_date date,
  release_year int,
  listen_at timestamptz not null,
  score int not null check (score between 1 and 10),
  personal_tags text[] not null default '{}',
  artist_id text not null,
  artist_name text not null,
  country_code text,
  country_name text,
  city_name text,
  coordinates geography(point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_records_user_id on public.user_records(user_id);
create index if not exists idx_user_records_listen_at on public.user_records(listen_at desc);
create index if not exists idx_user_records_release_year on public.user_records(release_year);
create index if not exists idx_user_records_country_code on public.user_records(country_code);
create index if not exists idx_user_records_coordinates on public.user_records using gist(coordinates);

alter table public.user_records enable row level security;

create policy "user_records_select_own"
on public.user_records
for select
using (auth.uid() = user_id);

create policy "user_records_insert_own"
on public.user_records
for insert
with check (auth.uid() = user_id);

create policy "user_records_update_own"
on public.user_records
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_records_delete_own"
on public.user_records
for delete
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_records_set_updated_at on public.user_records;
create trigger trg_user_records_set_updated_at
before update on public.user_records
for each row
execute function public.set_updated_at();

drop trigger if exists trg_artist_geo_cache_set_updated_at on public.artist_geo_cache;
create trigger trg_artist_geo_cache_set_updated_at
before update on public.artist_geo_cache
for each row
execute function public.set_updated_at();