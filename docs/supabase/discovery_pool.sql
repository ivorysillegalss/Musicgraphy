create table if not exists public.discovery_pool (
  id text primary key,
  album_title text not null,
  artist_name text not null,
  release_year int not null,
  country_code text not null,
  country_name text not null,
  city_name text not null,
  lng double precision not null,
  lat double precision not null,
  enabled boolean not null default true,
  weight int not null default 1 check (weight between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists idx_discovery_pool_country on public.discovery_pool(country_code);
create index if not exists idx_discovery_pool_release_year on public.discovery_pool(release_year);

alter table public.discovery_pool enable row level security;

create policy "discovery_pool_public_read"
on public.discovery_pool
for select
using (enabled = true);
