-- Empty and edge states: "Notify me if {size} comes back".
-- Re-runnable: every statement is guarded.

-- One row per person per size. Signed-in buyers are stored by user and email; guests by email.
-- notified_at is set when the restock email goes out; a later sell-out lets them sign up again.
create table if not exists public.restock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  size text not null,
  user_id uuid references public.users (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index if not exists restock_alerts_waiting_uniq
  on public.restock_alerts (variant_id, lower(email)) where notified_at is null;
create index if not exists restock_alerts_variant_idx on public.restock_alerts (variant_id) where notified_at is null;

alter table public.restock_alerts enable row level security;
-- Buyers can see and remove their own; inserts and sends go through the server.
drop policy if exists restock_alerts_own on public.restock_alerts;
create policy restock_alerts_own on public.restock_alerts for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists restock_alerts_delete_own on public.restock_alerts;
create policy restock_alerts_delete_own on public.restock_alerts for delete
  using (user_id = auth.uid());
grant select, delete on public.restock_alerts to authenticated;
grant all on public.restock_alerts to service_role;

-- "Send us photos, we'll list it": photos a founding or invited maker sends for the team to list.
create table if not exists public.listing_requests (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  photo_urls text[] not null check (cardinality(photo_urls) between 1 and 12),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'new' check (status in ('new', 'listed', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists listing_requests_maker_idx on public.listing_requests (maker_id, created_at desc);
alter table public.listing_requests enable row level security;
drop policy if exists listing_requests_read on public.listing_requests;
create policy listing_requests_read on public.listing_requests for select
  using (maker_id = public.my_maker_id() or public.is_admin());
grant select on public.listing_requests to authenticated;
grant all on public.listing_requests to service_role;

-- When the maker first copied their shop link (ticks "Share your shop link" on the first-order checklist).
alter table public.makers add column if not exists shop_link_copied_at timestamptz;
