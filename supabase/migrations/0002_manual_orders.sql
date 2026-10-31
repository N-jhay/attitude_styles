create table if not exists public.manual_orders (
  id bigint generated always as identity primary key,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_phone text not null check (char_length(customer_phone) between 3 and 40),
  delivery_address text not null default '',
  city_state text not null default '',
  order_summary text not null check (char_length(order_summary) between 1 and 5000),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'fulfilled', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_orders_created_at_idx on public.manual_orders (created_at desc);
alter table public.manual_orders enable row level security;

drop policy if exists manual_orders_admin_select on public.manual_orders;
create policy manual_orders_admin_select on public.manual_orders
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists manual_orders_admin_insert on public.manual_orders;
create policy manual_orders_admin_insert on public.manual_orders
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists manual_orders_admin_update on public.manual_orders;
create policy manual_orders_admin_update on public.manual_orders
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
