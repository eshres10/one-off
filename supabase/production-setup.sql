-- One Off: full database setup for a new Supabase project.
-- Paste into Supabase Dashboard > SQL Editor and click Run. Runs as one transaction.
-- Generated from supabase/migrations by scripts/build-production-sql.sh; do not edit by hand.

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

-- ===== 0006_returns.sql =====
-- Returns policy: checkout acknowledgement, agreed custom specs and fault claims.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated
-- (0002 also drops every public policy on each run).

-- ---------------------------------------------------------------------------
-- Orders: the buyer's acknowledgement of the returns policy, and the agreed spec for custom work
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists returns_ack_at timestamptz;
alter table public.orders add column if not exists returns_policy_version text;
alter table public.orders add column if not exists agreed_spec jsonb;

-- The agreed spec is a contract snapshot: it can be set while the order is pending, never after.
create or replace function public.lock_order_agreed_spec() returns trigger
language plpgsql as $$
begin
  if old.status <> 'pending' and new.agreed_spec is distinct from old.agreed_spec then
    raise exception 'The agreed spec can''t be changed after payment' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
drop trigger if exists orders_lock_agreed_spec on public.orders;
create trigger orders_lock_agreed_spec before update on public.orders
  for each row execute function public.lock_order_agreed_spec();

-- Commissions are agreed before any order exists, so the snapshot is also kept on the request.
alter table public.commission_requests add column if not exists agreed_spec jsonb;
alter table public.commission_requests add column if not exists agreed_at timestamptz;

create or replace function public.lock_commission_agreed_spec() returns trigger
language plpgsql as $$
begin
  if old.agreed_spec is not null and new.agreed_spec is distinct from old.agreed_spec then
    raise exception 'The agreed spec can''t be changed once agreed' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
drop trigger if exists commission_requests_lock_agreed_spec on public.commission_requests;
create trigger commission_requests_lock_agreed_spec before update on public.commission_requests
  for each row execute function public.lock_commission_agreed_spec();

-- Returns are now one platform-wide policy (lib/content/returns.ts); the old per-maker text
-- is no longer shown anywhere.
alter table public.makers alter column return_policy set default '';
update public.makers set return_policy = '' where return_policy <> '';

-- ---------------------------------------------------------------------------
-- Fault claims ("Report a problem")
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'claim_reason') then
    create type claim_reason as enum ('faulty', 'damaged', 'not_as_described', 'wrong_item', 'custom_fit');
  end if;
  if not exists (select 1 from pg_type where typname = 'claim_status') then
    create type claim_status as enum (
      'open', 'seller_responded', 'resolved_repair', 'resolved_replace', 'resolved_refund', 'escalated', 'rejected'
    );
  end if;
end
$$;

create table if not exists public.return_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  buyer_id uuid not null references public.users (id) on delete cascade,
  seller_id uuid not null references public.makers (id) on delete restrict,
  reason claim_reason not null,
  details text not null check (char_length(details) between 20 and 4000),
  -- Object paths in the private `claims` storage bucket, never public URLs.
  photos text[] not null check (cardinality(photos) between 1 and 6),
  status claim_status not null default 'open',
  -- The maker's proposed remedy and message.
  proposal text check (proposal in ('repair', 'replace', 'refund', 'alteration')),
  seller_response text check (seller_response is null or char_length(seller_response) <= 4000),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 4000),
  refund_cents integer check (refund_cents is null or refund_cents > 0),
  respond_by timestamptz not null,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  seller_responded_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists return_claims_seller_idx on public.return_claims (seller_id, status, created_at desc);
create index if not exists return_claims_buyer_idx on public.return_claims (buyer_id, created_at desc);
create index if not exists return_claims_order_idx on public.return_claims (order_id);
create index if not exists return_claims_due_idx on public.return_claims (respond_by) where status = 'open';
-- One active claim per item; a resolved or rejected item can be reported again.
create unique index if not exists return_claims_one_active
  on public.return_claims (order_item_id) where status in ('open', 'seller_responded', 'escalated');

drop trigger if exists return_claims_touch on public.return_claims;
create trigger return_claims_touch before update on public.return_claims
  for each row execute function public.touch_updated_at();

alter table public.return_claims enable row level security;
grant select, insert on public.return_claims to authenticated;
grant all on public.return_claims to service_role;

-- Buyers see their own claims, makers see claims on their items, admins see everything.
-- Status changes go through server code (service role) after an explicit role check.
drop policy if exists return_claims_select on public.return_claims;
create policy return_claims_select on public.return_claims for select
  using (buyer_id = auth.uid() or seller_id = public.my_maker_id() or public.is_admin());

drop policy if exists return_claims_insert on public.return_claims;
create policy return_claims_insert on public.return_claims for insert
  with check (
    buyer_id = auth.uid()
    and status = 'open'
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and oi.order_id = return_claims.order_id
        and oi.maker_id = seller_id
        and o.buyer_user_id = auth.uid()
    )
  );

-- Private bucket for claim photos (Supabase only; local development stores them on disk).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('claims', 'claims', false, 10485760,
            array['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

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

-- ===== 0007_app_shell.sql =====
-- App shell update: search, saved-item alerts, homepage rails, product-level conversations,
-- seed placeholders and future store sync.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated
-- (0002 also drops every public policy on each run).

-- ---------------------------------------------------------------------------
-- Search: one weighted full-text document per product (name, maker, category, tags, occasion)
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists occasions text[] not null default '{}';
alter table public.products add column if not exists search_vector tsvector;

create or replace function public.product_search_document(p public.products) returns tsvector
language sql stable as $$
  select
    setweight(to_tsvector('english', coalesce(p.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((select display_name from public.makers m where m.id = p.maker_id), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p.category, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(p.tags, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(p.occasions, ' ')
      || case when cardinality(p.occasions) > 0 then ' occasion' else '' end), 'B') ||
    setweight(to_tsvector('english', array_to_string(p.colours, ' ')), 'C') ||
    setweight(to_tsvector('english', replace(p.product_type::text, '_', ' ')), 'C')
$$;

create or replace function public.products_refresh_search() returns trigger
language plpgsql as $$
begin
  new.search_vector := public.product_search_document(new);
  return new;
end
$$;
drop trigger if exists products_refresh_search on public.products;
create trigger products_refresh_search before insert or update of title, maker_id, category, tags, occasions, colours, product_type
  on public.products for each row execute function public.products_refresh_search();

-- A renamed maker re-indexes their pieces.
create or replace function public.makers_refresh_product_search() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.products p set search_vector = public.product_search_document(p) where p.maker_id = new.id;
  end if;
  return new;
end
$$;
drop trigger if exists makers_refresh_product_search on public.makers;
create trigger makers_refresh_product_search after update of display_name on public.makers
  for each row execute function public.makers_refresh_product_search();

update public.products p set search_vector = public.product_search_document(p) where p.search_vector is null;
create index if not exists products_search_idx on public.products using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Saved pieces: price when saved (for price-drop alerts) and sold-out sizes a shopper looked at
-- (for "Back in your size")
-- ---------------------------------------------------------------------------
alter table public.saved_items add column if not exists price_at_save integer
  check (price_at_save is null or price_at_save > 0);
update public.saved_items s set price_at_save = p.price_cents
  from public.products p where p.id = s.product_id and s.price_at_save is null;

create table if not exists public.size_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);
create index if not exists size_watches_variant_idx on public.size_watches (variant_id);
alter table public.size_watches enable row level security;
grant select, insert, delete on public.size_watches to authenticated;
grant all on public.size_watches to service_role;
drop policy if exists size_watches_own on public.size_watches;
create policy size_watches_own on public.size_watches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Homepage rails
-- ---------------------------------------------------------------------------
-- Most popular: saves plus views over the last `p_days` days. Security definer so the counts can
-- include every shopper's saves without exposing whose they are.
create or replace function public.popular_products(p_days integer default 7, p_limit integer default 10)
returns table (product_id uuid, recent_saves integer, recent_views integer)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(s.n, 0)::int,
         coalesce(v.n, 0)::int
  from public.products p
  join public.makers m on m.id = p.maker_id
  left join (select si.product_id, count(*) as n from public.saved_items si
             where si.created_at > now() - make_interval(days => p_days) group by si.product_id) s on s.product_id = p.id
  left join (select pv.product_id, count(*) as n from public.product_views pv
             where pv.created_at > now() - make_interval(days => p_days) group by pv.product_id) v on v.product_id = p.id
  where p.status = 'approved' and m.status = 'approved'
  order by coalesce(s.n, 0) + coalesce(v.n, 0) desc, p.save_count desc, p.approved_at desc nulls last, p.id
  limit least(greatest(p_limit, 1), 50)
$$;

-- Shop by maker: active makers, most recent sales first (paid items in the last 90 days).
create or replace function public.makers_by_recent_sales()
returns table (maker_id uuid, recent_sales integer, piece_count integer)
language sql stable security definer set search_path = public as $$
  select m.id,
         (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id
           where oi.maker_id = m.id and o.status in ('paid', 'partially_refunded')
             and o.created_at > now() - interval '90 days')::int,
         (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved')::int
  from public.makers m
  where m.status = 'approved'
  order by 2 desc, m.approved_at desc nulls last, m.display_name
$$;

revoke all on function public.popular_products(integer, integer) from public;
revoke all on function public.makers_by_recent_sales() from public;
grant execute on function public.popular_products(integer, integer) to anon, authenticated, service_role;
grant execute on function public.makers_by_recent_sales() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Product-level conversations. message_threads is the conversations table: one thread per
-- buyer + maker + product (enquiry) or per custom request.
-- ---------------------------------------------------------------------------
do $$ begin
  create type conversation_kind as enum ('enquiry', 'custom_request');
exception when duplicate_object then null; end $$;
do $$ begin
  create type conversation_status as enum ('open', 'resolved', 'reported');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_kind as enum ('text', 'quote', 'system');
exception when duplicate_object then null; end $$;

alter table public.message_threads add column if not exists kind conversation_kind not null default 'enquiry';
alter table public.message_threads add column if not exists buyer_unread integer not null default 0 check (buyer_unread >= 0);
alter table public.message_threads add column if not exists maker_unread integer not null default 0 check (maker_unread >= 0);
alter table public.message_threads add column if not exists maker_needs_reply boolean not null default false;
alter table public.message_threads add column if not exists reply_due_at timestamptz;
alter table public.message_threads add column if not exists status conversation_status not null default 'open';
alter table public.message_threads add column if not exists buyer_blocked_at timestamptz;

update public.message_threads set kind = 'custom_request'
  where commission_request_id is not null and kind = 'enquiry';
create unique index if not exists message_threads_unique_request
  on public.message_threads (commission_request_id) where commission_request_id is not null;
create index if not exists message_threads_needs_reply_idx
  on public.message_threads (maker_id, reply_due_at) where maker_needs_reply;

alter table public.messages add column if not exists kind message_kind not null default 'text';
alter table public.messages add column if not exists quote jsonb;

-- Backfill counters from read markers (first run only: counters are still zero).
update public.message_threads t set
  buyer_unread = (select count(*) from public.messages m where m.thread_id = t.id and not m.is_flagged
    and m.sender_user_id <> t.buyer_user_id and m.created_at > coalesce(t.buyer_last_read_at, 'epoch')),
  maker_unread = (select count(*) from public.messages m where m.thread_id = t.id and not m.is_flagged
    and m.sender_user_id = t.buyer_user_id and m.created_at > coalesce(t.maker_last_read_at, 'epoch'))
where t.buyer_unread = 0 and t.maker_unread = 0;
update public.message_threads t set maker_needs_reply = true, reply_due_at = last.created_at + interval '6 hours'
from (
  select distinct on (m.thread_id) m.thread_id, m.sender_user_id, m.created_at
  from public.messages m where not m.is_flagged order by m.thread_id, m.created_at desc
) last
where last.thread_id = t.id and last.sender_user_id = t.buyer_user_id
  and not t.maker_needs_reply and t.reply_due_at is null;

-- One digest email per hour while a maker has unread messages.
alter table public.makers add column if not exists message_digest_sent_at timestamptz;

-- Moderation backstop: messages carrying contact details, links or bank/payment words are only
-- ever stored flagged (never delivered), whichever path inserts them.
create or replace function public.message_has_contact_details(p_body text) returns boolean
language sql immutable as $$
  select p_body ~* '[a-z0-9._%+-]+[[:space:]]*@[[:space:]]*[a-z0-9.-]+\.[a-z]{2,}'
      or p_body ~ '[0-9]([[:space:].-]?[0-9]){7,}'
      or p_body ~* '(https?://|www\.)'
      or p_body ~* '[a-z0-9-]{2,}\.(com|net|org|io|me|co|shop|store|link|ly|app)(\.au)?([^a-z]|$)'
      or p_body ~* '(^|[^a-z])(paypal|bsb|bank)([^a-z]|$)'
$$;

create or replace function public.messages_block_contact_details() returns trigger
language plpgsql as $$
begin
  if not new.is_flagged and new.kind = 'text' and public.message_has_contact_details(new.body) then
    raise exception 'Contact details, bank details and payment links can''t be sent.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
drop trigger if exists messages_block_contact_details on public.messages;
create trigger messages_block_contact_details before insert on public.messages
  for each row execute function public.messages_block_contact_details();

-- Custom requests: the deposit is paid through Checkout once the buyer accepts a quote.
alter table public.commission_requests add column if not exists deposit_cents integer check (deposit_cents is null or deposit_cents >= 0);
alter table public.commission_requests add column if not exists deposit_paid_at timestamptz;
alter table public.commission_requests add column if not exists stripe_deposit_session_id text;
alter table public.commission_requests add column if not exists stripe_deposit_payment_intent_id text;

-- Live updates over Supabase Realtime (the publication only exists on Supabase).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Private bucket for photos attached to messages (Supabase only; local development uses disk).
-- Served through /api/messages/media/..., which checks the viewer is in the conversation.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('message-media', 'message-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Seed photography is marked so it's easy to find and replace with real maker photos.
-- ---------------------------------------------------------------------------
alter table public.product_images add column if not exists is_placeholder boolean not null default false;

-- ---------------------------------------------------------------------------
-- Future store sync (Shopify / WooCommerce). Columns only; nothing reads or writes them yet.
-- ---------------------------------------------------------------------------
do $$ begin
  create type external_store as enum ('shopify', 'woocommerce');
exception when duplicate_object then null; end $$;
alter table public.products add column if not exists external_store external_store;
alter table public.products add column if not exists external_product_id text;
alter table public.orders add column if not exists external_store external_store;
alter table public.orders add column if not exists external_order_id text;
create unique index if not exists products_external_idx
  on public.products (external_store, external_product_id) where external_product_id is not null;
create unique index if not exists orders_external_idx
  on public.orders (external_store, external_order_id) where external_order_id is not null;

-- ===== 0008_discover.sql =====
-- Discover, quick view and the mega menu.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated
-- (0002 also drops every public policy on each run).

-- ---------------------------------------------------------------------------
-- Makers chosen for the "Featured" column of the Makers menu.
-- ---------------------------------------------------------------------------
alter table public.makers add column if not exists is_featured boolean not null default false;

-- ---------------------------------------------------------------------------
-- Image dimensions, so the Discover masonry reserves the right height (no layout shift).
-- ---------------------------------------------------------------------------
alter table public.product_images add column if not exists width integer check (width is null or width > 0);
alter table public.product_images add column if not exists height integer check (height is null or height > 0);

-- ---------------------------------------------------------------------------
-- Discover ranking and filters in one place so they can be tuned without touching the app.
-- Returns every matching piece with a sort key; callers page through it with a keyset cursor
-- on (sort_key, product_id), both descending. "Relevant" blends recency, saves in the last
-- 14 days, maker rating and (when searching) text rank, and is stable within the hour so
-- infinite scroll never skips or repeats a piece.
-- ---------------------------------------------------------------------------
create or replace function public.discover_feed(
  p_query text default null,
  p_cat text default null,
  p_sizes text[] default null,
  p_avail text[] default null,
  p_max_cents integer default null,
  p_colours text[] default null,
  p_suburb text default null,
  p_sort text default 'relevant'
)
returns table (product_id uuid, sort_key numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.price_cents, p.save_count, coalesce(p.approved_at, p.created_at) as listed_at,
      m.rating,
      (select count(*) from public.saved_items s
        where s.product_id = p.id and s.created_at > now() - interval '14 days') as saves14,
      case when p_query is null then 0
        else ts_rank(p.search_vector, to_tsquery('english', p_query)) end as text_rank
    from public.products p
    join public.makers m on m.id = p.maker_id
    where p.status = 'approved' and m.status = 'approved'
      and (p_query is null or p.search_vector @@ to_tsquery('english', p_query))
      and (p_cat is null or p_cat = 'all' or case p_cat
        when 'dresses' then p.category in ('dresses', 'occasionwear') or p.search_vector @@ to_tsquery('english', 'dress:* | gown:* | maxi:*')
        when 'slips' then p.search_vector @@ to_tsquery('english', 'slip:*')
        when 'sets' then p.category in ('sets', 'jumpsuits') or p.search_vector @@ to_tsquery('english', 'set:* | co-ord:*')
        when 'occasion' then cardinality(p.occasions) > 0 or p.category = 'occasionwear'
        when 'mto' then p.product_type = 'made_to_order'
        when 'ooo' then p.product_type = 'one_of_one'
        when 'satin' then coalesce(p.fabric_composition, '') ~* 'satin|silk' or p.title ~* 'satin|silk'
        when 'linen' then coalesce(p.fabric_composition, '') ~* 'linen|cotton'
        when 'tailoring' then p.title ~* 'blazer|suit|trouser|tailor|waistcoat|jacket'
        when 'outerwear' then p.category = 'outerwear' or p.title ~* 'jacket|coat|trench'
        when 'under-300' then p.price_cents < 30000
        else true end)
      and (p_sizes is null or exists (
        select 1 from public.product_variants v where v.product_id = p.id and v.is_active
          and v.size = any(p_sizes) and (v.stock_quantity > 0 or p.product_type = 'made_to_order')))
      and (p_avail is null or p.product_type::text = any(p_avail))
      and (p_max_cents is null or p.price_cents <= p_max_cents)
      and (p_colours is null or exists (select 1 from unnest(p.colours) c where lower(c) = any(p_colours)))
      and (p_suburb is null or lower(trim(split_part(coalesce(m.location, m.city, ''), ',', 1))) = lower(p_suburb))
  )
  select b.id,
    round(case p_sort
      when 'new' then extract(epoch from b.listed_at)::numeric
      when 'popular' then (b.saves14 * 5 + b.save_count)::numeric
      when 'price-asc' then -b.price_cents::numeric
      when 'price-desc' then b.price_cents::numeric
      else (
        100 * b.text_rank
        + 40 * exp(-extract(epoch from date_trunc('hour', now()) - b.listed_at) / 86400 / 30)
        + 10 * ln(1 + b.saves14)
        + 4 * coalesce(b.rating, 0)
      )::numeric
    end, 6) as sort_key
  from base b
$$;
revoke all on function public.discover_feed(text, text, text[], text[], integer, text[], text, text) from public;
grant execute on function public.discover_feed(text, text, text[], text[], integer, text[], text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public questions on a piece (quick view and product page). Anyone can read them on a live
-- piece; signed-in shoppers ask, and the piece's maker replies (parent_id set,
-- is_maker_reply true). Contact details are refused, as in messages.
create table if not exists public.product_questions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  parent_id uuid references public.product_questions(id) on delete cascade,
  is_maker_reply boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_maker_reply = (parent_id is not null))
);
create index if not exists product_questions_product_idx on public.product_questions (product_id, created_at);
create index if not exists product_questions_parent_idx on public.product_questions (parent_id);
create index if not exists product_questions_user_idx on public.product_questions (user_id);

alter table public.product_questions enable row level security;

drop policy if exists product_questions_select on public.product_questions;
create policy product_questions_select on public.product_questions for select
  using ((not is_hidden and public.product_is_public(product_id)) or user_id = auth.uid()
    or public.owns_product(product_id) or public.is_admin());

drop policy if exists product_questions_ask on public.product_questions;
create policy product_questions_ask on public.product_questions for insert
  with check (user_id = auth.uid() and parent_id is null and not is_maker_reply and not is_hidden
    and public.product_is_public(product_id) and not public.owns_product(product_id));

drop policy if exists product_questions_reply on public.product_questions;
create policy product_questions_reply on public.product_questions for insert
  with check (user_id = auth.uid() and is_maker_reply and not is_hidden
    and public.owns_product(product_id)
    and exists (select 1 from public.product_questions q
                where q.id = product_questions.parent_id and q.product_id = product_questions.product_id and q.parent_id is null));

drop policy if exists product_questions_admin on public.product_questions;
create policy product_questions_admin on public.product_questions for update
  using (public.is_admin()) with check (public.is_admin());

grant select on public.product_questions to anon, authenticated;
grant insert on public.product_questions to authenticated;
grant update (is_hidden) on public.product_questions to authenticated;
grant all on public.product_questions to service_role;

create or replace function public.product_questions_block_contact_details() returns trigger
language plpgsql as $$
begin
  if public.message_has_contact_details(new.body) then
    raise exception 'Contact details, bank details and payment links can''t be posted.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
drop trigger if exists product_questions_block_contact_details on public.product_questions;
create trigger product_questions_block_contact_details before insert on public.product_questions
  for each row execute function public.product_questions_block_contact_details();

-- ===== 0009_studio.sql =====
-- Studio: the seller side. Shops are the existing `makers` rows and a maker's part of a buyer
-- order is the existing `fulfilments` row, so everything here extends those tables.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.

-- ---------------------------------------------------------------------------
-- Statuses
-- ---------------------------------------------------------------------------
-- A maker's part of an order: paid → making → ready (made to order) → shipped → delivered →
-- completed (money released), or issue (a fault claim holds the money) / refunded.
alter type fulfilment_status add value if not exists 'making';
alter type fulfilment_status add value if not exists 'ready';
alter type fulfilment_status add value if not exists 'completed';
alter type fulfilment_status add value if not exists 'issue';

-- ---------------------------------------------------------------------------
-- Shops (makers)
-- ---------------------------------------------------------------------------
-- A shop listed by One Off has no owner until the maker claims it.
alter table public.makers alter column user_id drop not null;

-- Studio state. Visibility still follows `status`: draft/invited shops are 'draft', live and
-- holiday shops are 'approved', closed shops are 'paused'.
alter table public.makers add column if not exists shop_status text not null default 'draft';
do $$ begin
  alter table public.makers add constraint makers_shop_status_check
    check (shop_status in ('draft', 'invited', 'live', 'holiday', 'closed'));
exception when duplicate_object then null; end $$;
update public.makers set shop_status = 'live'
  where status = 'approved' and shop_status = 'draft';

alter table public.makers add column if not exists instagram text;
alter table public.makers add column if not exists tags text[] not null default '{}';
alter table public.makers add column if not exists founding_number integer;
alter table public.makers add column if not exists founding_until timestamptz;
alter table public.makers add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.makers add column if not exists dispatch_option text;
alter table public.makers add column if not exists mto_default_lead text;
alter table public.makers add column if not exists mto_weekly_capacity integer
  check (mto_weekly_capacity is null or mto_weekly_capacity between 1 and 500);
alter table public.makers add column if not exists local_pickup boolean not null default false;
alter table public.makers add column if not exists custom_from_cents integer
  check (custom_from_cents is null or custom_from_cents > 0);
alter table public.makers add column if not exists custom_deposit_pct integer
  check (custom_deposit_pct is null or custom_deposit_pct between 0 and 100);
alter table public.makers add column if not exists custom_reply_within text;
alter table public.makers add column if not exists custom_blurb text
  check (custom_blurb is null or char_length(custom_blurb) <= 600);
alter table public.makers add column if not exists policy_extra text
  check (policy_extra is null or char_length(policy_extra) <= 300);
alter table public.makers add column if not exists care_default text;
alter table public.makers add column if not exists holiday_from date;
alter table public.makers add column if not exists holiday_until date;
alter table public.makers add column if not exists holiday_note text
  check (holiday_note is null or char_length(holiday_note) <= 280);
alter table public.makers add column if not exists created_by_admin boolean not null default false;
alter table public.makers add column if not exists invite_email citext;
alter table public.makers add column if not exists claimed_at timestamptz;
alter table public.makers add column if not exists went_live_at timestamptz;
alter table public.makers add column if not exists closed_at timestamptz;
alter table public.makers add column if not exists slug_changed_at timestamptz;
alter table public.makers add column if not exists abn text check (abn is null or abn ~ '^[0-9]{11}$');
alter table public.makers add column if not exists gst_registered boolean not null default false;
alter table public.makers add column if not exists mobile text;
alter table public.makers add column if not exists bank_name text;
alter table public.makers add column if not exists bank_last4 text;
alter table public.makers add column if not exists claim_step integer not null default 0;
create unique index if not exists makers_founding_number_idx on public.makers (founding_number)
  where founding_number is not null;
create index if not exists makers_shop_status_idx on public.makers (shop_status);

-- Existing live makers have connected Stripe through the old onboarding.
update public.makers set stripe_charges_enabled = true
  where stripe_onboarding_complete and not stripe_charges_enabled;

-- Old shop links keep working after a rename.
create table if not exists public.maker_slug_redirects (
  old_slug text primary key,
  maker_id uuid not null references public.makers (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Shipping rates by region. The "rest of Australia" standard rate is what the bag charges.
create table if not exists public.maker_shipping_rates (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  region text not null check (region in ('same_state', 'au', 'nz')),
  standard_cents integer not null default 0 check (standard_cents >= 0),
  express_cents integer check (express_cents is null or express_cents >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (maker_id, region)
);
insert into public.maker_shipping_rates (maker_id, region, standard_cents, express_cents, enabled)
select id, 'au', shipping_standard_cents, null, true from public.makers
on conflict (maker_id, region) do nothing;

-- The Seller Agreement, as accepted. Append-only.
create table if not exists public.seller_agreements (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete restrict,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  photo_rights_confirmed boolean not null
);
create index if not exists seller_agreements_maker_idx on public.seller_agreements (maker_id, accepted_at desc);

create or replace function public.seller_agreements_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'Seller agreements can''t be changed or deleted' using errcode = 'insufficient_privilege';
end
$$;
drop trigger if exists seller_agreements_append_only on public.seller_agreements;
create trigger seller_agreements_append_only before update or delete on public.seller_agreements
  for each row execute function public.seller_agreements_append_only();

-- Invite links to claim a shop. Only a SHA-256 hash of the token is stored.
create table if not exists public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  token_hash text not null unique,
  email citext not null,
  expires_at timestamptz not null,
  opened_at timestamptz,
  used_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shop_invites_maker_idx on public.shop_invites (maker_id, created_at desc);

-- Claim and Studio funnel events (claim_opened, claim_step_n, stripe_connected, went_live…).
create table if not exists public.shop_events (
  id bigint generated always as identity primary key,
  maker_id uuid not null references public.makers (id) on delete cascade,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shop_events_maker_idx on public.shop_events (maker_id, created_at desc);

-- Stripe payouts from a maker's connected account, mirrored for the Payouts page.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  stripe_payout_id text not null unique,
  amount_cents integer not null,
  arrival_date date,
  status text not null,
  order_count integer not null default 0,
  sales_cents integer,
  fees_cents integer,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payouts_maker_idx on public.payouts (maker_id, arrival_date desc);

-- Which notifications a person gets, and how.
create table if not exists public.notification_prefs (
  user_id uuid not null references public.users (id) on delete cascade,
  event text not null check (event in
    ('new_order', 'ship_by_reminder', 'message', 'low_stock', 'payout_sent', 'weekly_summary')),
  email boolean not null default true,
  push boolean not null default false,
  sms boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, event)
);

-- Texts and other non-email notifications, for audit (mirrors email_outbox).
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'push')),
  to_address text not null,
  template text not null,
  body text not null,
  status text not null,
  provider_id text,
  error text,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now()
);

-- HTML bodies for the branded emails.
alter table public.email_outbox add column if not exists body_html text;

-- ---------------------------------------------------------------------------
-- Pieces
-- ---------------------------------------------------------------------------
-- Live = 'approved', hidden = 'archived', draft = 'draft'. Makers publish their own pieces.
alter table public.products add column if not exists listed_by_admin boolean not null default false;
alter table public.products add column if not exists reviewed_by_seller_at timestamptz;
alter table public.products add column if not exists keep_on_claim boolean not null default true;
alter table public.products add column if not exists mto_lead text;
alter table public.products add column if not exists mto_capacity integer
  check (mto_capacity is null or mto_capacity between 1 and 500);
alter table public.products add column if not exists accepts_custom boolean not null default false;
alter table public.products add column if not exists published_at timestamptz;

-- Buyers can give their measurements for a "Custom" size on made-to-order pieces.
alter table public.cart_items add column if not exists custom_measurements jsonb;
alter table public.order_items add column if not exists custom_measurements jsonb;

-- ---------------------------------------------------------------------------
-- Orders (a maker's part of an order is a fulfilment)
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists gift_note text
  check (gift_note is null or char_length(gift_note) <= 300);

-- estimated_dispatch_date is the ship-by date (business days, AU public holidays skipped).
alter table public.fulfilments add column if not exists mto_step smallint not null default 0
  check (mto_step between 0 and 3);
alter table public.fulfilments add column if not exists shipping_method text;
alter table public.fulfilments add column if not exists commission_pct_applied numeric(5, 2);
alter table public.fulfilments add column if not exists processing_fee_cents integer not null default 0;
alter table public.fulfilments add column if not exists transfer_released_at timestamptz;
alter table public.fulfilments add column if not exists delivery_source text
  check (delivery_source is null or delivery_source in ('carrier', 'buyer', 'auto', 'maker', 'admin'));
alter table public.fulfilments add column if not exists ship_by_reminded_at timestamptz;
alter table public.fulfilments add column if not exists reply_token text;
create index if not exists fulfilments_release_idx on public.fulfilments (status, delivered_at)
  where stripe_transfer_id is null;
create unique index if not exists fulfilments_reply_token_idx on public.fulfilments (reply_token)
  where reply_token is not null;

-- Existing paid orders were transferred at payment under the old flow: mark them released so the
-- release job never pays them twice.
update public.fulfilments set transfer_released_at = coalesce(transfer_released_at, updated_at)
  where stripe_transfer_id is not null and transfer_released_at is null;
update public.fulfilments set commission_pct_applied = 15
  where commission_pct_applied is null and subtotal_cents > 0
    and platform_commission_cents = round(subtotal_cents * 0.15);

-- ---------------------------------------------------------------------------
-- Guards: makers publish and hide their own pieces; platform fields stay platform-managed
-- ---------------------------------------------------------------------------
create or replace function public.guard_product_write() returns trigger
language plpgsql as $$
declare
  shop text;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    select shop_status into shop from public.makers where id = new.maker_id;
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') or new.is_featured or new.listed_by_admin then
        raise exception 'New pieces start as drafts' using errcode = 'insufficient_privilege';
      end if;
    else
      if new.status is distinct from old.status then
        if new.status = 'rejected' or old.status = 'rejected' then
          raise exception 'Only admins can change a rejected piece' using errcode = 'insufficient_privilege';
        end if;
        if new.status = 'approved' and coalesce(shop, '') not in ('live', 'holiday') then
          raise exception 'Pieces go live once your shop is live' using errcode = 'insufficient_privilege';
        end if;
      end if;
      if new.is_featured is distinct from old.is_featured
         or new.maker_id is distinct from old.maker_id
         or new.listed_by_admin is distinct from old.listed_by_admin
         or new.view_count is distinct from old.view_count
         or new.save_count is distinct from old.save_count then
        raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.published_at := now();
  end if;
  return new;
end
$$;

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
       or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.completed_orders is distinct from old.completed_orders
       or new.user_id is distinct from old.user_id
       or new.slug is distinct from old.slug
       or new.shop_status is distinct from old.shop_status
       or new.founding_number is distinct from old.founding_number
       or new.founding_until is distinct from old.founding_until
       or new.created_by_admin is distinct from old.created_by_admin
       or new.claimed_at is distinct from old.claimed_at
       or new.went_live_at is distinct from old.went_live_at
       or new.bank_name is distinct from old.bank_name
       or new.bank_last4 is distinct from old.bank_last4 then
      raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

-- Delivered pieces stay reviewable once the maker has been paid (status 'completed').
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
  if item.fulfilment_status::text not in ('delivered', 'completed') then
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

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.maker_slug_redirects enable row level security;
alter table public.maker_shipping_rates enable row level security;
alter table public.seller_agreements enable row level security;
alter table public.shop_invites enable row level security;
alter table public.shop_events enable row level security;
alter table public.payouts enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;

grant select on public.maker_slug_redirects, public.maker_shipping_rates to anon, authenticated;
grant insert, update, delete on public.maker_shipping_rates to authenticated;
grant select, insert on public.seller_agreements to authenticated;
grant select on public.payouts, public.shop_events to authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;
grant all on public.maker_slug_redirects, public.maker_shipping_rates, public.seller_agreements,
  public.shop_invites, public.shop_events, public.payouts, public.notification_prefs,
  public.notification_log to service_role;
revoke all on public.shop_invites, public.notification_log from anon, authenticated;
revoke insert, update, delete on public.shop_events, public.payouts from authenticated;
revoke update, delete on public.seller_agreements from authenticated;

drop policy if exists maker_slug_redirects_read on public.maker_slug_redirects;
create policy maker_slug_redirects_read on public.maker_slug_redirects for select using (true);

-- Rates are public for live shops (the bag and product pages show them); makers edit their own.
drop policy if exists maker_shipping_rates_read on public.maker_shipping_rates;
create policy maker_shipping_rates_read on public.maker_shipping_rates for select
  using (maker_id = public.my_maker_id() or public.is_admin()
    or exists (select 1 from public.makers m where m.id = maker_id and m.status = 'approved'));
drop policy if exists maker_shipping_rates_own on public.maker_shipping_rates;
create policy maker_shipping_rates_own on public.maker_shipping_rates for all
  using (maker_id = public.my_maker_id()) with check (maker_id = public.my_maker_id());

drop policy if exists seller_agreements_own on public.seller_agreements;
create policy seller_agreements_own on public.seller_agreements for select
  using (maker_id = public.my_maker_id() or user_id = auth.uid() or public.is_admin());
drop policy if exists seller_agreements_insert on public.seller_agreements;
create policy seller_agreements_insert on public.seller_agreements for insert
  with check (user_id = auth.uid() and maker_id = public.my_maker_id());

drop policy if exists shop_events_own on public.shop_events;
create policy shop_events_own on public.shop_events for select
  using (maker_id = public.my_maker_id() or public.is_admin());

drop policy if exists payouts_own on public.payouts;
create policy payouts_own on public.payouts for select
  using (maker_id = public.my_maker_id() or public.is_admin());

drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_log_admin on public.notification_log;
create policy notification_log_admin on public.notification_log for select using (public.is_admin());

drop policy if exists shop_invites_admin on public.shop_invites;
create policy shop_invites_admin on public.shop_invites for select using (public.is_admin());

-- ===== 0010_onboarding.sql =====
-- Onboarding, taste picker and scroll effects.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.

-- ---------------------------------------------------------------------------
-- Homepage hero: the velvet sofa image replaces the linen suit (only if it wasn't changed since).
-- ---------------------------------------------------------------------------
update public.editorial_placements set image_url = '/seed/hero-velvet-sofa.jpg'
  where slot = 'home_hero' and image_url = '/seed/hero-linen-suit.jpg';

-- ---------------------------------------------------------------------------
-- Style tags: a fixed vocabulary (lib/taste/tags.ts) makers pick up to four of per piece.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists style_tags text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_style_tags_vocab') then
    alter table public.products add constraint products_style_tags_vocab check (
      cardinality(style_tags) <= 4 and style_tags <@ array[
        'Satin', 'Linen', 'Cotton', 'Lace & crochet', 'Knit',
        'Neutrals', 'Soft colour', 'Bold colour', 'Earthy', 'Monochrome',
        'Minimal', 'Romantic', 'Statement', 'Tailoring', 'Evening', 'Holiday']::text[]);
  end if;
end $$;
create index if not exists products_style_tags_idx on public.products using gin (style_tags);

-- A first guess at a piece's style from its title, fabric and colours: one fabric, one colour
-- group and up to two moods. Used to tag existing pieces; makers can change them.
create or replace function public.infer_style_tags(
  p_title text, p_fabric text, p_colours text[], p_category text, p_description text default ''
) returns text[]
language plpgsql immutable as $$
declare
  t text := lower(coalesce(p_title, '') || ' ' || coalesce(p_fabric, ''));
  d text := lower(coalesce(p_description, ''));
  c text := lower(array_to_string(coalesce(p_colours, '{}'), ' '));
  tags text[] := '{}';
  moods text[] := '{}';
begin
  tags := tags || case
    when t ~ 'lace|crochet' then 'Lace & crochet'
    when t ~ 'satin|silk|charmeuse' then 'Satin'
    when t ~ 'knit|merino|wool' then 'Knit'
    when t ~ 'linen' then 'Linen'
    when t ~ 'cotton|poplin|denim|chambray' then 'Cotton'
    else null end;
  tags := tags || case
    when c = '' then null
    when c ~ '^(black|ivory|white)( (black|ivory|white))*$' then 'Monochrome'
    when c ~ 'scarlet|tangerine|emerald|cobalt|fuchsia|red' then 'Bold colour'
    when c ~ 'rust|olive|chocolate|brown|khaki|tan|wine|terracotta' then 'Earthy'
    when c ~ 'blush|butter|sage|lilac|pink|sky|mint' then 'Soft colour'
    else 'Neutrals' end;
  if t ~ 'blazer|suit|trouser|tailor|waistcoat|jacket' then moods := array_append(moods, 'Tailoring'); end if;
  if t ~ 'gown|column|satin|silk' or p_category = 'occasionwear' then moods := array_append(moods, 'Evening'); end if;
  if t ~ 'lace|ruffle|tier|floral|bow|puff' then moods := array_append(moods, 'Romantic'); end if;
  if t ~ 'corset|sequin|cape|sculpt|statement' or c ~ 'scarlet|tangerine|emerald' then moods := array_append(moods, 'Statement'); end if;
  if t ~ 'linen|crochet|kaftan|resort|sun|halter' or d ~ 'holiday|summer|beach' then moods := array_append(moods, 'Holiday'); end if;
  if t ~ 'slip|shift|column|tank|shirt' and not (moods && array['Romantic', 'Statement']) then moods := array_append(moods, 'Minimal'); end if;
  if cardinality(moods) = 0 then moods := array['Minimal']; end if;
  return (array_remove(tags, null) || moods[1:2])[1:4];
end $$;

update public.products set style_tags = public.infer_style_tags(title, fabric_composition, colours, category, description)
  where style_tags = '{}';

-- ---------------------------------------------------------------------------
-- Shopper preferences from onboarding, and the taste profile that ranks their feed.
-- taste_tags maps a style tag to a weight; picks add 1 per tag, later saves 1, add to bag 2,
-- purchases 3, a long quick view 0.25, all decaying gently (half-life of about three weeks).
-- ---------------------------------------------------------------------------
create table if not exists public.customer_prefs (
  user_id uuid primary key references public.users (id) on delete cascade,
  sizes text[] not null default '{}',
  height_band text check (height_band in ('under-165', '165-175', 'over-175')),
  occasions text[] not null default '{}',
  taste_tags jsonb not null default '{}'::jsonb,
  taste_picks uuid[] not null default '{}',
  taste_updated_at timestamptz,
  onboarding_step integer not null default 0 check (onboarding_step between 0 and 6),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists customer_prefs_touch on public.customer_prefs;
create trigger customer_prefs_touch before update on public.customer_prefs
  for each row execute function public.touch_updated_at();

alter table public.customer_prefs enable row level security;
drop policy if exists customer_prefs_own on public.customer_prefs;
create policy customer_prefs_own on public.customer_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.customer_prefs to authenticated;
grant all on public.customer_prefs to service_role;

-- First-visit tours, shown once each unless replayed.
alter table public.users add column if not exists tour_completed_at timestamptz;
alter table public.users add column if not exists studio_tour_completed_at timestamptz;
-- People who signed up before the tours existed skip them (they can replay from Help).
update public.users set tour_completed_at = coalesce(tour_completed_at, created_at),
  studio_tour_completed_at = coalesce(studio_tour_completed_at, created_at)
  where created_at < '2026-10-20';

-- Adds a piece's tags to a shopper's taste, after decaying what's there since the last change.
create or replace function public.bump_taste(p_user uuid, p_product uuid, p_weight numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tags text[];
  prefs public.customer_prefs;
  decay numeric;
  out_tags jsonb := '{}'::jsonb;
  k text;
  v numeric;
begin
  select style_tags into tags from public.products where id = p_product;
  if tags is null or cardinality(tags) = 0 then return; end if;
  insert into public.customer_prefs (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into prefs from public.customer_prefs where user_id = p_user for update;
  decay := exp(-greatest(0, extract(epoch from now() - coalesce(prefs.taste_updated_at, now())) / 86400) / 30);
  for k, v in select key, value::numeric from jsonb_each_text(prefs.taste_tags) loop
    if v * decay >= 0.05 then out_tags := out_tags || jsonb_build_object(k, round(v * decay, 3)); end if;
  end loop;
  foreach k in array tags loop
    out_tags := out_tags || jsonb_build_object(k, round(coalesce((out_tags ->> k)::numeric, 0) + p_weight, 3));
  end loop;
  update public.customer_prefs set taste_tags = out_tags, taste_updated_at = now() where user_id = p_user;
end $$;
revoke all on function public.bump_taste(uuid, uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discover ranking, now personal: "Relevant" adds a taste match (cosine of the piece's tags
-- against the shopper's weights) and a size match. Signed-out shoppers rank as before.
-- ---------------------------------------------------------------------------
drop function if exists public.discover_feed(text, text, text[], text[], integer, text[], text, text);
create or replace function public.discover_feed(
  p_query text default null,
  p_cat text default null,
  p_sizes text[] default null,
  p_avail text[] default null,
  p_max_cents integer default null,
  p_colours text[] default null,
  p_suburb text default null,
  p_sort text default 'relevant',
  p_user_id uuid default null
)
returns table (product_id uuid, sort_key numeric)
language sql stable security definer set search_path = public as $$
  with prefs as (
    select cp.taste_tags, cp.sizes,
      sqrt(coalesce((select sum(power(value::numeric, 2)) from jsonb_each_text(cp.taste_tags)), 0)) as norm
    from public.customer_prefs cp where cp.user_id = p_user_id
  ),
  base as (
    select p.id, p.price_cents, p.save_count, coalesce(p.approved_at, p.created_at) as listed_at,
      m.rating, p.style_tags,
      (select count(*) from public.saved_items s
        where s.product_id = p.id and s.created_at > now() - interval '14 days') as saves14,
      case when p_query is null then 0
        else ts_rank(p.search_vector, to_tsquery('english', p_query)) end as text_rank
    from public.products p
    join public.makers m on m.id = p.maker_id
    where p.status = 'approved' and m.status = 'approved'
      and (p_query is null or p.search_vector @@ to_tsquery('english', p_query))
      and (p_cat is null or p_cat = 'all' or case p_cat
        when 'dresses' then p.category in ('dresses', 'occasionwear') or p.search_vector @@ to_tsquery('english', 'dress:* | gown:* | maxi:*')
        when 'slips' then p.search_vector @@ to_tsquery('english', 'slip:*')
        when 'sets' then p.category in ('sets', 'jumpsuits') or p.search_vector @@ to_tsquery('english', 'set:* | co-ord:*')
        when 'occasion' then cardinality(p.occasions) > 0 or p.category = 'occasionwear'
        when 'mto' then p.product_type = 'made_to_order'
        when 'ooo' then p.product_type = 'one_of_one'
        when 'satin' then coalesce(p.fabric_composition, '') ~* 'satin|silk' or p.title ~* 'satin|silk'
        when 'linen' then coalesce(p.fabric_composition, '') ~* 'linen|cotton'
        when 'tailoring' then p.title ~* 'blazer|suit|trouser|tailor|waistcoat|jacket'
        when 'outerwear' then p.category = 'outerwear' or p.title ~* 'jacket|coat|trench'
        when 'under-300' then p.price_cents < 30000
        else true end)
      and (p_sizes is null or exists (
        select 1 from public.product_variants v where v.product_id = p.id and v.is_active
          and v.size = any(p_sizes) and (v.stock_quantity > 0 or p.product_type = 'made_to_order')))
      and (p_avail is null or p.product_type::text = any(p_avail))
      and (p_max_cents is null or p.price_cents <= p_max_cents)
      and (p_colours is null or exists (select 1 from unnest(p.colours) c where lower(c) = any(p_colours)))
      and (p_suburb is null or lower(trim(split_part(coalesce(m.location, m.city, ''), ',', 1))) = lower(p_suburb))
  ),
  scored as (
    select b.*,
      coalesce((
        select case when pr.norm = 0 or cardinality(b.style_tags) = 0 then 0
          else (select coalesce(sum((pr.taste_tags ->> t)::numeric), 0) from unnest(b.style_tags) t)
            / pr.norm / sqrt(cardinality(b.style_tags)) end
        from prefs pr), 0) as taste,
      coalesce((
        select case when cardinality(pr.sizes) = 0 then 0
          when exists (select 1 from public.product_variants v where v.product_id = b.id and v.is_active
            and v.size = any(pr.sizes) and v.stock_quantity > 0) then 1 else 0 end
        from prefs pr), 0) as size_match
    from base b
  )
  select s.id,
    round(case p_sort
      when 'new' then extract(epoch from s.listed_at)::numeric
      when 'popular' then (s.saves14 * 5 + s.save_count)::numeric
      when 'price-asc' then -s.price_cents::numeric
      when 'price-desc' then s.price_cents::numeric
      else (
        100 * s.text_rank
        + 40 * exp(-extract(epoch from date_trunc('hour', now()) - s.listed_at) / 86400 / 30)
        + 10 * ln(1 + s.saves14)
        + 4 * coalesce(s.rating, 0)
        + 60 * s.taste
        + 12 * s.size_match
      )::numeric
    end, 6) as sort_key
  from scored s
$$;
revoke all on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) from public;
grant execute on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Makers ↔ One Off: one conversation per maker account ("Message One Off" in Studio, and
-- "Rather we list your first pieces for you?" in seller sign-up). Admins reply from /admin/support.
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid references public.makers (id) on delete set null,
  from_admin boolean not null default false,
  sender_user_id uuid references public.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  topic text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_user_idx on public.support_messages (user_id, created_at);
alter table public.support_messages enable row level security;
drop policy if exists support_messages_own_read on public.support_messages;
create policy support_messages_own_read on public.support_messages for select using (user_id = auth.uid());
drop policy if exists support_messages_own_write on public.support_messages;
create policy support_messages_own_write on public.support_messages for insert
  with check (user_id = auth.uid() and sender_user_id = auth.uid() and not from_admin);
grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

-- ---------------------------------------------------------------------------
-- Makers who sign up themselves (/sell/start), rather than being set up by One Off. Their shop
-- stays a draft until the first piece is published and payouts are connected.
-- ---------------------------------------------------------------------------
alter table public.makers add column if not exists self_signup boolean not null default false;
alter table public.makers add column if not exists sell_modes text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'makers_sell_modes_check') then
    alter table public.makers add constraint makers_sell_modes_check
      check (sell_modes <@ array['ready_to_ship', 'made_to_order', 'custom']::text[]);
  end if;
end $$;

-- ===== 0011_applications.sql =====
-- Seller applications and approval, founding spots, spot checks and launch mode.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.
--
-- "Shops" are rows in public.makers. Makers apply at /sell/apply; nobody lists or sells until
-- an admin approves them. Invited makers (/claim/[token]) are pre-approved and skip review.

-- ---------------------------------------------------------------------------
-- Shop status: draft (application not sent yet), applied, changes_requested, approved,
-- live, holiday, declined, closed, invited. Buyers only ever see live and holiday shops.
-- ---------------------------------------------------------------------------
alter table public.makers drop constraint if exists makers_shop_status_check;
alter table public.makers add constraint makers_shop_status_check check (shop_status in (
  'draft', 'applied', 'changes_requested', 'approved', 'live', 'holiday', 'declined', 'closed', 'invited'));

alter table public.makers add column if not exists applied_at timestamptz;
alter table public.makers add column if not exists reviewed_at timestamptz;
alter table public.makers add column if not exists reviewed_by uuid references public.users (id) on delete set null;
-- Shown to the maker (changes requested, or the reason for a decline).
alter table public.makers add column if not exists review_note text;
alter table public.makers add column if not exists can_reapply_after date;
alter table public.makers add column if not exists source text not null default 'application';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'makers_source_check') then
    alter table public.makers add constraint makers_source_check check (source in ('invite', 'application'));
  end if;
end $$;
-- The application being written (answers + photos), saved after every step. Each submission is
-- copied into shop_applications, which keeps it as it was sent.
alter table public.makers add column if not exists application jsonb not null default '{}'::jsonb;
-- Pieces still to be spot-checked after approval (3 for a newly approved applicant).
alter table public.makers add column if not exists spot_checks_left integer not null default 0;
create index if not exists makers_applied_idx on public.makers (applied_at) where shop_status = 'applied';

update public.makers set source = 'invite' where created_by_admin and source <> 'invite';

-- ---------------------------------------------------------------------------
-- Submitted applications: one row per submission, never edited (only the decision is filled in).
-- ---------------------------------------------------------------------------
create table if not exists public.shop_applications (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  answers jsonb not null,
  photo_urls text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  decision text check (decision in ('approved', 'changes_requested', 'declined')),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null,
  decision_note text
);
create index if not exists shop_applications_maker_idx on public.shop_applications (maker_id, submitted_at desc);

create or replace function public.guard_shop_application() returns trigger
language plpgsql as $$
begin
  if new.answers is distinct from old.answers or new.photo_urls is distinct from old.photo_urls
     or new.submitted_at is distinct from old.submitted_at or new.maker_id is distinct from old.maker_id then
    raise exception 'Submitted applications can’t be changed' using errcode = 'insufficient_privilege';
  end if;
  if old.decision is not null and new.decision is distinct from old.decision then
    raise exception 'This application already has a decision' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
drop trigger if exists shop_applications_guard on public.shop_applications;
create trigger shop_applications_guard before update on public.shop_applications
  for each row execute function public.guard_shop_application();

-- Admin-only notes about a shop (kept out of public.makers, which the maker can read).
create table if not exists public.shop_internal_notes (
  maker_id uuid primary key references public.makers (id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Spot checks: the first pieces a newly approved shop publishes are flagged for a quick look.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists spot_check boolean not null default false;
alter table public.products add column if not exists spot_checked_at timestamptz;
alter table public.products add column if not exists spot_check_note text;
create index if not exists products_spot_check_idx on public.products (published_at) where spot_check and spot_checked_at is null;

-- ---------------------------------------------------------------------------
-- Site settings the admin can change without a deploy (launch mode, opening date).
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Publishing needs an approved (or live) shop: checked here and in the RLS policies below.
-- ---------------------------------------------------------------------------
create or replace function public.shop_can_publish(p_maker_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.makers m
    where m.id = p_maker_id and m.shop_status in ('approved', 'live', 'holiday')
  )
$$;

-- Uses up one of the shop's spot checks (runs as the owner, past the maker-update guard). Only
-- from the product trigger: a direct call does nothing.
create or replace function public.take_spot_check(p_maker_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 then return false; end if;
  update public.makers set spot_checks_left = spot_checks_left - 1
    where id = p_maker_id and spot_checks_left > 0;
  return found;
end
$$;

create or replace function public.guard_product_write() returns trigger
language plpgsql as $$
declare
  shop text;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    select shop_status into shop from public.makers where id = new.maker_id;
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') or new.is_featured or new.listed_by_admin then
        raise exception 'New pieces start as drafts' using errcode = 'insufficient_privilege';
      end if;
    else
      if new.status is distinct from old.status then
        if new.status = 'rejected' or old.status = 'rejected' then
          raise exception 'Only admins can change a rejected piece' using errcode = 'insufficient_privilege';
        end if;
        if new.status = 'approved' and coalesce(shop, '') not in ('approved', 'live', 'holiday') then
          raise exception 'You can publish pieces once your shop is approved' using errcode = 'insufficient_privilege';
        end if;
      end if;
      if new.is_featured is distinct from old.is_featured
         or new.maker_id is distinct from old.maker_id
         or new.listed_by_admin is distinct from old.listed_by_admin
         or new.view_count is distinct from old.view_count
         or new.save_count is distinct from old.save_count
         or new.spot_check is distinct from old.spot_check
         or new.spot_checked_at is distinct from old.spot_checked_at
         or new.spot_check_note is distinct from old.spot_check_note then
        raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.published_at := now();
    -- First publish of a piece from a newly approved shop: flag it for a spot check.
    if not new.spot_check and new.spot_checked_at is null and public.take_spot_check(new.maker_id) then
      new.spot_check := true;
    end if;
  end if;
  return new;
end
$$;

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
       or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.completed_orders is distinct from old.completed_orders
       or new.user_id is distinct from old.user_id
       or new.slug is distinct from old.slug
       or new.shop_status is distinct from old.shop_status
       or new.founding_number is distinct from old.founding_number
       or new.founding_until is distinct from old.founding_until
       or new.created_by_admin is distinct from old.created_by_admin
       or new.claimed_at is distinct from old.claimed_at
       or new.went_live_at is distinct from old.went_live_at
       or new.bank_name is distinct from old.bank_name
       or new.bank_last4 is distinct from old.bank_last4
       or new.applied_at is distinct from old.applied_at
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by
       or new.review_note is distinct from old.review_note
       or new.can_reapply_after is distinct from old.can_reapply_after
       or new.source is distinct from old.source
       or new.spot_checks_left is distinct from old.spot_checks_left then
      raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

-- Buyers only see live (or on-holiday) shops and their published pieces.
create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.makers m on m.id = p.maker_id
    where p.id = p_product_id and p.status = 'approved' and m.status = 'approved'
      and m.shop_status in ('live', 'holiday')
  )
$$;

drop policy if exists makers_select on public.makers;
create policy makers_select on public.makers for select
  using ((status = 'approved' and shop_status in ('live', 'holiday')) or user_id = auth.uid() or public.is_admin());

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert
  with check (
    (maker_id = public.my_maker_id() and (status <> 'approved' or public.shop_can_publish(maker_id)))
    or public.is_admin());
drop policy if exists products_update on public.products;
create policy products_update on public.products for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (
    (maker_id = public.my_maker_id() and (status <> 'approved' or public.shop_can_publish(maker_id)))
    or public.is_admin());

alter table public.shop_applications enable row level security;
alter table public.shop_internal_notes enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists shop_applications_read on public.shop_applications;
create policy shop_applications_read on public.shop_applications for select
  using (public.is_admin() or maker_id = public.my_maker_id());
drop policy if exists shop_applications_admin on public.shop_applications;
create policy shop_applications_admin on public.shop_applications for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists shop_internal_notes_admin on public.shop_internal_notes;
create policy shop_internal_notes_admin on public.shop_internal_notes for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select using (true);
drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

grant select, update on public.shop_applications to authenticated;
grant select, insert, update, delete on public.shop_internal_notes to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
grant all on public.shop_applications, public.shop_internal_notes, public.site_settings to service_role;

-- ---------------------------------------------------------------------------
-- Existing rows. Invited shops keep their status. Self-sign-up shops that hadn't gone live become
-- applications waiting for review: their founding number (given automatically at sign-up) is
-- released for the admin to award, and pieces waiting to go live go back to drafts.
-- ---------------------------------------------------------------------------
update public.products p set status = 'draft'
  from public.makers m
  where p.maker_id = m.id and m.self_signup and m.shop_status = 'draft' and p.status = 'pending';
update public.makers set shop_status = 'applied', applied_at = coalesce(applied_at, created_at),
    founding_number = null, founding_until = null,
    application = application || jsonb_build_object('name', display_name, 'suburb', location,
      'instagram', instagram, 'makes', to_jsonb(tags), 'modes', to_jsonb(sell_modes))
  where self_signup and shop_status = 'draft';
insert into public.shop_applications (maker_id, answers, submitted_at)
  select m.id, m.application, m.applied_at from public.makers m
  where m.shop_status = 'applied'
    and not exists (select 1 from public.shop_applications a where a.maker_id = m.id);

-- ---------------------------------------------------------------------------
-- The old per-shop returns default promised 14-day returns, which contradicts the marketplace
-- policy (no change-of-mind returns). Replace it wherever it was never edited.
-- ---------------------------------------------------------------------------
alter table public.makers alter column return_policy set default
  'No change-of-mind returns. Faulty or not as described? We''ll make it right.';
update public.makers set return_policy = 'No change-of-mind returns. Faulty or not as described? We''ll make it right.'
  where return_policy ilike 'Returns accepted within 14 days%';

-- ---------------------------------------------------------------------------
-- Discover: the place filter matches a maker's suburb or their city ("By city" in the menu).
-- Same as 0010 otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.discover_feed(
  p_query text default null,
  p_cat text default null,
  p_sizes text[] default null,
  p_avail text[] default null,
  p_max_cents integer default null,
  p_colours text[] default null,
  p_suburb text default null,
  p_sort text default 'relevant',
  p_user_id uuid default null
)
returns table (product_id uuid, sort_key numeric)
language sql stable security definer set search_path = public as $$
  with prefs as (
    select cp.taste_tags, cp.sizes,
      sqrt(coalesce((select sum(power(value::numeric, 2)) from jsonb_each_text(cp.taste_tags)), 0)) as norm
    from public.customer_prefs cp where cp.user_id = p_user_id
  ),
  base as (
    select p.id, p.price_cents, p.save_count, coalesce(p.approved_at, p.created_at) as listed_at,
      m.rating, p.style_tags,
      (select count(*) from public.saved_items s
        where s.product_id = p.id and s.created_at > now() - interval '14 days') as saves14,
      case when p_query is null then 0
        else ts_rank(p.search_vector, to_tsquery('english', p_query)) end as text_rank
    from public.products p
    join public.makers m on m.id = p.maker_id
    where p.status = 'approved' and m.status = 'approved'
      and (p_query is null or p.search_vector @@ to_tsquery('english', p_query))
      and (p_cat is null or p_cat = 'all' or case p_cat
        when 'dresses' then p.category in ('dresses', 'occasionwear') or p.search_vector @@ to_tsquery('english', 'dress:* | gown:* | maxi:*')
        when 'slips' then p.search_vector @@ to_tsquery('english', 'slip:*')
        when 'sets' then p.category in ('sets', 'jumpsuits') or p.search_vector @@ to_tsquery('english', 'set:* | co-ord:*')
        when 'occasion' then cardinality(p.occasions) > 0 or p.category = 'occasionwear'
        when 'mto' then p.product_type = 'made_to_order'
        when 'ooo' then p.product_type = 'one_of_one'
        when 'satin' then coalesce(p.fabric_composition, '') ~* 'satin|silk' or p.title ~* 'satin|silk'
        when 'linen' then coalesce(p.fabric_composition, '') ~* 'linen|cotton'
        when 'tailoring' then p.title ~* 'blazer|suit|trouser|tailor|waistcoat|jacket'
        when 'outerwear' then p.category = 'outerwear' or p.title ~* 'jacket|coat|trench'
        when 'under-300' then p.price_cents < 30000
        else true end)
      and (p_sizes is null or exists (
        select 1 from public.product_variants v where v.product_id = p.id and v.is_active
          and v.size = any(p_sizes) and (v.stock_quantity > 0 or p.product_type = 'made_to_order')))
      and (p_avail is null or p.product_type::text = any(p_avail))
      and (p_max_cents is null or p.price_cents <= p_max_cents)
      and (p_colours is null or exists (select 1 from unnest(p.colours) c where lower(c) = any(p_colours)))
      and (p_suburb is null or lower(trim(split_part(coalesce(m.location, m.city, ''), ',', 1))) = lower(p_suburb)
        or lower(m.city) = lower(p_suburb))
  ),
  scored as (
    select b.*,
      coalesce((
        select case when pr.norm = 0 or cardinality(b.style_tags) = 0 then 0
          else (select coalesce(sum((pr.taste_tags ->> t)::numeric), 0) from unnest(b.style_tags) t)
            / pr.norm / sqrt(cardinality(b.style_tags)) end
        from prefs pr), 0) as taste,
      coalesce((
        select case when cardinality(pr.sizes) = 0 then 0
          when exists (select 1 from public.product_variants v where v.product_id = b.id and v.is_active
            and v.size = any(pr.sizes) and v.stock_quantity > 0) then 1 else 0 end
        from prefs pr), 0) as size_match
    from base b
  )
  select s.id,
    round(case p_sort
      when 'new' then extract(epoch from s.listed_at)::numeric
      when 'popular' then (s.saves14 * 5 + s.save_count)::numeric
      when 'price-asc' then -s.price_cents::numeric
      when 'price-desc' then s.price_cents::numeric
      else (
        100 * s.text_rank
        + 40 * exp(-extract(epoch from date_trunc('hour', now()) - s.listed_at) / 86400 / 30)
        + 10 * ln(1 + s.saves14)
        + 4 * coalesce(s.rating, 0)
        + 60 * s.taste
        + 12 * s.size_match
      )::numeric
    end, 6) as sort_key
  from scored s
$$;
revoke all on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) from public;
grant execute on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) to anon, authenticated, service_role;


commit;
