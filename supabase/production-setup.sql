-- One Off: full database setup for a new Supabase project.
-- Paste into Supabase Dashboard > SQL Editor and click Run. Runs as one transaction.
-- Generated from supabase/migrations/0001-0006 by scripts/build-production-sql.sh; do not edit by hand.

begin;

-- ===== 0001_schema.sql =====
-- Core schema for the marketplace. Supabase-compatible (expects auth.users / auth.uid()).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('buyer', 'seller', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'maker_status') then
    create type maker_status as enum ('draft', 'pending', 'approved', 'paused');
  end if;
  if not exists (select 1 from pg_type where typname = 'product_type') then
    create type product_type as enum ('ready_to_ship', 'made_to_order', 'one_of_one');
  end if;
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type product_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'fulfilment_status') then
    create type fulfilment_status as enum (
      'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'commission_status') then
    create type commission_status as enum (
      'submitted', 'reviewing', 'quoted', 'accepted', 'declined', 'completed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'quote_status') then
    create type quote_status as enum ('pending', 'accepted', 'declined');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Users & makers
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name text,
  role user_role not null default 'buyer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_id_matches_auth check (id = auth_user_id)
);

create table if not exists public.makers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_name text not null,
  tagline text,
  story text,
  location text,
  city text,
  state text check (state in ('VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT')),
  process text,
  materials text,
  sizing_notes text,
  avatar_url text,
  cover_url text,
  lead_time_days integer not null default 14 check (lead_time_days >= 0),
  response_time_hours integer not null default 24 check (response_time_hours >= 0),
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0,
  completed_orders integer not null default 0,
  custom_commissions_enabled boolean not null default false,
  status maker_status not null default 'draft',
  rejection_reason text,
  stripe_account_id text unique,
  stripe_onboarding_complete boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  shipping_standard_cents integer not null default 1200 check (shipping_standard_cents >= 0),
  free_shipping_over_cents integer check (free_shipping_over_cents is null or free_shipping_over_cents > 0),
  dispatch_days integer not null default 3 check (dispatch_days >= 0),
  return_policy text not null default 'Returns accepted within 14 days of delivery on ready-to-ship pieces in original condition. Made-to-order and one-of-one pieces are final sale unless faulty.',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists makers_status_idx on public.makers (status);
create index if not exists makers_state_idx on public.makers (state);

create table if not exists public.maker_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, maker_id)
);
create index if not exists maker_follows_maker_idx on public.maker_follows (maker_id);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '',
  category text not null,
  tags text[] not null default '{}',
  colours text[] not null default '{}',
  price_cents integer not null check (price_cents > 0),
  currency char(3) not null default 'AUD' check (currency = 'AUD'),
  product_type product_type not null,
  status product_status not null default 'draft',
  rejection_reason text,
  is_featured boolean not null default false,
  fabric_composition text,
  care_instructions text,
  country_of_making text not null default 'Australia',
  model_height_cm integer check (model_height_cm is null or model_height_cm between 100 and 230),
  model_size_worn text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  made_to_order_options text,
  shipping_policy text,
  return_policy text,
  view_count integer not null default 0,
  save_count integer not null default 0,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_mto_lead_time check (
    product_type <> 'made_to_order' or (lead_time_days is not null and lead_time_days > 0)
  )
);
create index if not exists products_maker_idx on public.products (maker_id);
create index if not exists products_status_idx on public.products (status, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_type_idx on public.products (product_type);
create index if not exists products_price_idx on public.products (price_cents);
create index if not exists products_tags_idx on public.products using gin (tags);
create index if not exists products_colours_idx on public.products using gin (colours);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  alt_text text not null check (char_length(alt_text) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id, sort_order);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null,
  colour text,
  sku text unique,
  price_cents integer check (price_cents is null or price_cents > 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

create table if not exists public.product_measurements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size text,
  garment_measurement_name text not null,
  value_cm numeric(6, 1) not null check (value_cm > 0),
  notes text,
  sort_order integer not null default 0
);
create index if not exists product_measurements_product_idx on public.product_measurements (product_id);

-- One-of-one pieces are a single physical garment: exactly one active variant with stock <= 1.
create or replace function public.enforce_one_of_one_stock() returns trigger
language plpgsql as $$
declare
  ptype product_type;
begin
  select product_type into ptype from public.products where id = new.product_id;
  if ptype = 'one_of_one' and new.stock_quantity > 1 then
    raise exception 'One-of-one pieces must have a stock quantity of exactly one'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
drop trigger if exists product_variants_one_of_one on public.product_variants;
create trigger product_variants_one_of_one
  before insert or update on public.product_variants
  for each row execute function public.enforce_one_of_one_stock();

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  subtitle text,
  description text,
  hero_image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, product_id)
);
create index if not exists collection_products_product_idx on public.collection_products (product_id);

create table if not exists public.editorial_placements (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('home_hero', 'home_feature', 'home_collection')),
  title text not null,
  subtitle text,
  image_url text,
  href text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  session_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carts_user_idx on public.carts (user_id);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_cents integer not null check (unit_price_cents > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- Orders & fulfilment
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_user_id uuid references public.users (id) on delete set null,
  buyer_email citext not null,
  buyer_name text,
  status order_status not null default 'pending',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_total_cents integer not null check (shipping_total_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  platform_fee_total_cents integer not null default 0,
  refunded_cents integer not null default 0,
  currency char(3) not null default 'AUD',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  shipping_address jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders (buyer_user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

-- One fulfilment record per (order, maker): what the maker ships and gets paid for.
create table if not exists public.fulfilments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete restrict,
  status fulfilment_status not null default 'paid',
  subtotal_cents integer not null,
  shipping_cents integer not null,
  platform_commission_cents integer not null,
  seller_net_cents integer not null,
  stripe_transfer_id text,
  transfer_status text not null default 'pending' check (transfer_status in ('pending', 'created', 'reversed', 'failed', 'skipped')),
  tracking_number text,
  carrier text,
  estimated_dispatch_date date,
  estimated_delivery_from date,
  estimated_delivery_to date,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, maker_id)
);
create index if not exists fulfilments_maker_idx on public.fulfilments (maker_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  fulfilment_id uuid not null references public.fulfilments (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  maker_id uuid not null references public.makers (id) on delete restrict,
  product_title text not null,
  variant_label text not null,
  product_type product_type not null,
  image_url text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents > 0),
  line_total_cents integer not null,
  platform_commission_cents integer not null,
  seller_net_cents integer not null,
  refunded_cents integer not null default 0,
  fulfilment_status fulfilment_status not null default 'paid',
  tracking_number text,
  carrier text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_maker_idx on public.order_items (maker_id, created_at desc);
create index if not exists order_items_product_idx on public.order_items (product_id);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  reason text,
  stripe_refund_id text unique,
  status text not null default 'pending',
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete set null,
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  amount_cents integer not null,
  reason text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  buyer_user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text not null check (char_length(body) between 10 and 2000),
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists reviews_maker_idx on public.reviews (maker_id, created_at desc);
create index if not exists reviews_product_idx on public.reviews (product_id, created_at desc);

-- Reviews are only valid for a delivered order item owned by the reviewing buyer.
create or replace function public.enforce_review_eligibility() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  item record;
begin
  select oi.fulfilment_status, oi.maker_id, oi.product_id, o.buyer_user_id
    into item
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = new.order_item_id;
  if not found then
    raise exception 'Order item not found' using errcode = 'foreign_key_violation';
  end if;
  if item.fulfilment_status <> 'delivered' then
    raise exception 'Reviews can only be left for delivered orders' using errcode = 'check_violation';
  end if;
  if item.buyer_user_id is distinct from new.buyer_user_id then
    raise exception 'Only the buyer can review this order' using errcode = 'insufficient_privilege';
  end if;
  new.maker_id := item.maker_id;
  new.product_id := item.product_id;
  return new;
end
$$;
drop trigger if exists reviews_eligibility on public.reviews;
create trigger reviews_eligibility
  before insert on public.reviews
  for each row execute function public.enforce_review_eligibility();

-- Keep maker rating aggregates in sync.
create or replace function public.refresh_maker_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.makers m
     set rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.maker_id = m.id), 0),
         review_count = (select count(*) from public.reviews r where r.maker_id = m.id)
   where m.id = coalesce(new.maker_id, old.maker_id);
  return null;
end
$$;
drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_maker_rating();

-- ---------------------------------------------------------------------------
-- Buyer data
-- ---------------------------------------------------------------------------
create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists saved_items_product_idx on public.saved_items (product_id);

create table if not exists public.buyer_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 100 and 230),
  bust_cm numeric(5, 1) check (bust_cm is null or bust_cm between 50 and 200),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 40 and 200),
  hips_cm numeric(5, 1) check (hips_cm is null or hips_cm between 50 and 220),
  fit_notes text check (fit_notes is null or char_length(fit_notes) <= 1000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Commissions (concierge pilot)
-- ---------------------------------------------------------------------------
create table if not exists public.commission_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid references public.makers (id) on delete set null,
  source_product_id uuid references public.products (id) on delete set null,
  garment_type text not null,
  occasion text,
  inspiration_image_urls text[] not null default '{}',
  budget_min_cents integer not null check (budget_min_cents > 0),
  budget_max_cents integer not null,
  deadline_date date,
  measurements text,
  fabric_preferences text,
  colour_preferences text,
  notes text,
  status commission_status not null default 'submitted',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_budget_range check (budget_max_cents >= budget_min_cents)
);
create index if not exists commission_requests_maker_idx on public.commission_requests (maker_id, created_at desc);
create index if not exists commission_requests_buyer_idx on public.commission_requests (buyer_user_id, created_at desc);

create table if not exists public.commission_quotes (
  id uuid primary key default gen_random_uuid(),
  commission_request_id uuid not null references public.commission_requests (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  total_price_cents integer not null check (total_price_cents > 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  production_days integer not null check (production_days > 0),
  revisions_included integer not null default 1 check (revisions_included >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  estimated_delivery_date date,
  message text,
  status quote_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint quote_deposit_lte_total check (deposit_cents <= total_price_cents)
);
create index if not exists commission_quotes_request_idx on public.commission_quotes (commission_request_id);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  commission_request_id uuid references public.commission_requests (id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  buyer_last_read_at timestamptz,
  maker_last_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists message_threads_unique_product
  on public.message_threads (buyer_user_id, maker_id, product_id)
  where product_id is not null and commission_request_id is null;
create index if not exists message_threads_buyer_idx on public.message_threads (buyer_user_id, last_message_at desc);
create index if not exists message_threads_maker_idx on public.message_threads (maker_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_user_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  image_urls text[] not null default '{}',
  is_flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists messages_flagged_idx on public.messages (is_flagged) where is_flagged;

create table if not exists public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  account text,
  livemode boolean not null default false,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email citext not null,
  template text not null,
  subject text not null,
  body_text text not null,
  provider text not null,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'logged')),
  error text,
  related_entity_type text,
  related_entity_id text,
  created_at timestamptz not null default now()
);
create index if not exists email_outbox_created_idx on public.email_outbox (created_at desc);
create index if not exists email_outbox_to_idx on public.email_outbox (to_email);

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create table if not exists public.product_views (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  viewer_key text,
  created_at timestamptz not null default now()
);
create index if not exists product_views_maker_idx on public.product_views (maker_id, created_at desc);
create index if not exists product_views_product_idx on public.product_views (product_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'makers', 'products', 'product_variants', 'collections', 'editorial_placements',
    'carts', 'orders', 'fulfilments', 'commission_requests', 'disputes'
  ]
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end
$$;

create or replace function public.touch_buyer_measurements() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;
drop trigger if exists buyer_measurements_touch on public.buyer_measurements;
create trigger buyer_measurements_touch before update on public.buyer_measurements
  for each row execute function public.touch_buyer_measurements();

-- ===== 0002_rls.sql =====
-- Row Level Security. Server code runs user-scoped queries as the `authenticated` role with
-- request.jwt.claims set (see lib/db/index.ts), exactly as Supabase PostgREST does, so these
-- policies are the real enforcement boundary for buyer/seller data.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

-- Exposes only a first name so makers can address buyers without reading the users table.
create or replace function public.user_first_name(p_user_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select split_part(coalesce(display_name, 'Shopper'), ' ', 1) from public.users where id = p_user_id
$$;

create or replace function public.my_maker_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.makers where user_id = auth.uid()
$$;

create or replace function public.is_order_buyer(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders where id = p_order_id and buyer_user_id = auth.uid())
$$;

create or replace function public.is_order_maker(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fulfilments f
    where f.order_id = p_order_id and f.maker_id = public.my_maker_id()
  )
$$;

create or replace function public.is_thread_participant(p_thread_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (t.buyer_user_id = auth.uid() or t.maker_id = public.my_maker_id())
  )
$$;

create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.makers m on m.id = p.maker_id
    where p.id = p_product_id and p.status = 'approved' and m.status = 'approved'
  )
$$;

create or replace function public.owns_product(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id and p.maker_id = public.my_maker_id()
  )
$$;

create or replace function public.can_view_commission(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.commission_requests c
    where c.id = p_request_id
      and (c.buyer_user_id = auth.uid() or c.maker_id = public.my_maker_id())
  )
$$;

-- ---------------------------------------------------------------------------
-- Column guards: sellers may not self-approve or edit platform-managed fields.
-- ---------------------------------------------------------------------------
create or replace function public.guard_maker_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.status is distinct from old.status
       and not (old.status = 'draft' and new.status = 'pending') then
      raise exception 'Only admins can change maker status' using errcode = 'insufficient_privilege';
    end if;
    if new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
       or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.completed_orders is distinct from old.completed_orders
       or new.user_id is distinct from old.user_id
       or new.slug is distinct from old.slug then
      raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists makers_guard on public.makers;
create trigger makers_guard before update on public.makers
  for each row execute function public.guard_maker_update();

create or replace function public.guard_product_write() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') or new.is_featured then
        raise exception 'New listings must be draft or pending review' using errcode = 'insufficient_privilege';
      end if;
    else
      if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
        raise exception 'Only admins can approve or reject listings' using errcode = 'insufficient_privilege';
      end if;
      if new.is_featured is distinct from old.is_featured
         or new.maker_id is distinct from old.maker_id
         or new.view_count is distinct from old.view_count
         or new.save_count is distinct from old.save_count then
        raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists products_guard on public.products;
create trigger products_guard before insert or update on public.products
  for each row execute function public.guard_product_write();

-- ---------------------------------------------------------------------------
-- Grants (RLS decides which rows)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- Drop-and-recreate keeps this file re-runnable.
do $$
declare
  p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

-- users
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_admin());
create policy users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

-- makers
create policy makers_select on public.makers for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy makers_update_own on public.makers for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy makers_admin_insert on public.makers for insert with check (public.is_admin());

-- maker_follows
create policy follows_select on public.maker_follows for select
  using (user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy follows_insert on public.maker_follows for insert with check (user_id = auth.uid());
create policy follows_delete on public.maker_follows for delete using (user_id = auth.uid());

-- products & children
create policy products_select on public.products for select
  using (public.product_is_public(id) or maker_id = public.my_maker_id() or public.is_admin());
create policy products_insert on public.products for insert
  with check (maker_id = public.my_maker_id() or public.is_admin());
create policy products_update on public.products for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());
create policy products_delete on public.products for delete
  using ((maker_id = public.my_maker_id() and status = 'draft') or public.is_admin());

create policy product_images_select on public.product_images for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_images_write on public.product_images for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

create policy product_variants_select on public.product_variants for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_variants_write on public.product_variants for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

create policy product_measurements_select on public.product_measurements for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_measurements_write on public.product_measurements for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

-- editorial
create policy collections_select on public.collections for select using (is_active or public.is_admin());
create policy collections_admin on public.collections for all
  using (public.is_admin()) with check (public.is_admin());
create policy collection_products_select on public.collection_products for select using (true);
create policy collection_products_admin on public.collection_products for all
  using (public.is_admin()) with check (public.is_admin());
create policy placements_select on public.editorial_placements for select using (is_active or public.is_admin());
create policy placements_admin on public.editorial_placements for all
  using (public.is_admin()) with check (public.is_admin());

-- carts (guest carts are handled server-side by an unguessable session cookie)
create policy carts_own on public.carts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_own on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- orders
create policy orders_select on public.orders for select
  using (buyer_user_id = auth.uid() or public.is_order_maker(id) or public.is_admin());

create policy fulfilments_select on public.fulfilments for select
  using (maker_id = public.my_maker_id() or public.is_order_buyer(order_id) or public.is_admin());
create policy fulfilments_update on public.fulfilments for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

create policy order_items_select on public.order_items for select
  using (maker_id = public.my_maker_id() or public.is_order_buyer(order_id) or public.is_admin());
create policy order_items_update on public.order_items for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

create policy refunds_select on public.refunds for select
  using (public.is_order_buyer(order_id) or public.is_order_maker(order_id) or public.is_admin());
create policy disputes_admin on public.disputes for select using (public.is_admin());

-- reviews: public read; insert only by the buyer (trigger enforces delivered status)
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (buyer_user_id = auth.uid());

-- buyer data
create policy saved_items_own on public.saved_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy buyer_measurements_own on public.buyer_measurements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- commissions
create policy commission_requests_select on public.commission_requests for select
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy commission_requests_insert on public.commission_requests for insert
  with check (buyer_user_id = auth.uid());
create policy commission_requests_update on public.commission_requests for update
  using (maker_id = public.my_maker_id() or buyer_user_id = auth.uid() or public.is_admin())
  with check (maker_id = public.my_maker_id() or buyer_user_id = auth.uid() or public.is_admin());

create policy commission_quotes_select on public.commission_quotes for select
  using (public.can_view_commission(commission_request_id) or public.is_admin());
create policy commission_quotes_insert on public.commission_quotes for insert
  with check (maker_id = public.my_maker_id() and public.can_view_commission(commission_request_id));
create policy commission_quotes_update on public.commission_quotes for update
  using (public.can_view_commission(commission_request_id) or public.is_admin());

-- messaging
create policy threads_select on public.message_threads for select
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy threads_insert on public.message_threads for insert
  with check (buyer_user_id = auth.uid());
create policy threads_update on public.message_threads for update
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id());

create policy messages_select on public.messages for select
  using (public.is_thread_participant(thread_id) or public.is_admin());
create policy messages_insert on public.messages for insert
  with check (sender_user_id = auth.uid() and public.is_thread_participant(thread_id));

create policy reply_templates_own on public.reply_templates for all
  using (maker_id = public.my_maker_id()) with check (maker_id = public.my_maker_id());

-- analytics
create policy product_views_select on public.product_views for select
  using (maker_id = public.my_maker_id() or public.is_admin());

-- operations tables: admin read only; writes happen via the service connection
create policy audit_admin on public.audit_events for select using (public.is_admin());
create policy stripe_events_admin on public.stripe_events for select using (public.is_admin());
create policy email_outbox_admin on public.email_outbox for select using (public.is_admin());
-- rate_limits: no policies => no access for anon/authenticated

-- ===== 0003_functions.sql =====
-- Server-side helper functions.

create sequence if not exists public.order_number_seq start 10001;

create or replace function public.next_order_number() returns text
language sql volatile security definer set search_path = public as $$
  select 'OO-' || nextval('public.order_number_seq')::text
$$;

-- Fixed-window rate limiter. Returns true when the call is allowed.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return c <= p_max;
end
$$;

-- Atomically decrement stock; returns false (and changes nothing) if insufficient.
create or replace function public.decrement_stock(p_variant_id uuid, p_qty integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  updated integer;
begin
  -- Made-to-order stock is a production-capacity cap rather than inventory; the same
  -- atomic decrement applies so makers can limit open orders.
  update public.product_variants
     set stock_quantity = stock_quantity - p_qty
   where id = p_variant_id and stock_quantity >= p_qty;
  get diagnostics updated = row_count;
  return updated = 1;
end
$$;

revoke execute on function public.decrement_stock(uuid, integer) from anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from anon, authenticated;
revoke execute on function public.next_order_number() from anon, authenticated;

-- ===== 0004_dev_mock_stripe.sql =====
-- Storage for the local mock payments driver (PAYMENTS_DRIVER=mock). Holds simulated Stripe
-- objects (checkout sessions, transfers, refunds, accounts) so the webhook path can re-fetch
-- them exactly as it re-fetches real objects from the Stripe API. Unused with real Stripe.
create table if not exists public.mock_stripe_objects (
  id text primary key,
  type text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.mock_stripe_objects enable row level security;
revoke all on public.mock_stripe_objects from anon, authenticated;

-- ===== 0005_dispute_deadline.sql =====
-- Evidence deadline for payment disputes (from Stripe dispute.evidence_details.due_by).
alter table public.disputes add column if not exists evidence_due_by timestamptz;

-- ===== 0006_waitlist.sql =====
-- Pre-launch waitlist: shoppers who want to hear when we open, and makers who want to sell.
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  kind text not null check (kind in ('shopper', 'maker')),
  name text,
  instagram text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_signups_created_idx on public.waitlist_signups (created_at desc);
create index if not exists waitlist_signups_kind_idx on public.waitlist_signups (kind);

-- Sign-ups are written by the server (service connection) only; admins can read them.
alter table public.waitlist_signups enable row level security;
drop policy if exists waitlist_admin on public.waitlist_signups;
create policy waitlist_admin on public.waitlist_signups for select using (public.is_admin());

commit;
