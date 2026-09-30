-- Supabase schema for Attitude Styles storefront
create table if not exists public.store_state (
  id bigint primary key default 1,
  data_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.store_state enable row level security;
alter table public.profiles enable row level security;

create policy "Store data is public read" on public.store_state
  for select using (true);

create policy "Only admins can modify store data" on public.store_state
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins can insert store data" on public.store_state
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Profiles are visible only to the current user" on public.profiles
  for select using (auth.uid() = id);

create policy "Admins can maintain profiles" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure moddatetime(updated_at);

create trigger set_store_updated_at before update on public.store_state
  for each row execute procedure moddatetime(updated_at);
