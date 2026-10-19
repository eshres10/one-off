-- One Off update: "Add to home screen" and drop alerts (migration 0017): restore links, client events, push subscriptions.
-- Run supabase/updates/0016_content_pages.sql first if you haven't.
-- Paste into Supabase Dashboard > SQL Editor (new query) and click Run. Safe to run more than once.

begin;

-- "Add to home screen" and drop alerts. Re-runnable: every statement is guarded.

-- In-app browsers: "Copy link instead" carries a one-time token so a guest's bag and saved
-- pieces come with them to Safari or Chrome. Single use, valid 24 hours. Only the hash is kept.
create table if not exists public.restore_tokens (
  token_hash text primary key,
  cart_session_id uuid,
  saved_product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists restore_tokens_expires_idx on public.restore_tokens (expires_at);
alter table public.restore_tokens enable row level security;

-- Small product analytics from the browser (install_sheet_shown, install_accepted, …).
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) <= 60),
  props jsonb not null default '{}',
  path text check (path is null or char_length(path) <= 300),
  user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists client_events_name_idx on public.client_events (name, created_at desc);
alter table public.client_events enable row level security;

-- Drop alerts: one row per browser that said yes. Guests can subscribe too (user_id null).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  disabled_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

commit;
