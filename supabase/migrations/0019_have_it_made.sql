-- "Have it made": a buyer's brief, matched to up to 3 makers who quote; the accepted quote becomes
-- a custom order. Replaces the old single-maker commission requests (left in place for history).
-- Re-runnable: every statement is guarded.

-- Each maker's custom-work settings (1:1 with makers).
create table if not exists public.maker_custom_settings (
  maker_id uuid primary key references public.makers (id) on delete cascade,
  open boolean not null default false,
  spots_per_month integer not null default 4 check (spots_per_month between 0 and 50),
  categories text[] not null default '{}',
  fabrics text[] not null default '{}',
  -- A$ (whole dollars), like the budget bands.
  min_price integer not null default 0 check (min_price >= 0),
  lead_time_weeks int4range not null default '[2,4)',
  fittings_in_person boolean not null default false,
  -- 10, 20 or 50 km; null means "My city" (the matcher treats it as 30 km).
  fitting_radius_km integer check (fitting_radius_km is null or fitting_radius_km between 1 and 500),
  posts_australia_wide boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.maker_custom_settings enable row level security;
drop policy if exists maker_custom_settings_own on public.maker_custom_settings;
create policy maker_custom_settings_own on public.maker_custom_settings for all
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());
grant select, insert, update, delete on public.maker_custom_settings to authenticated;
grant all on public.maker_custom_settings to service_role;

-- Australian postcodes → suburb, state and a point, for "Fitzroy, VIC" and distances.
-- Source: GeoNames postal codes (via github.com/zauberware/postal-codes-json-xml-csv, data/AU.zip),
-- licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); attribution: GeoNames
-- (https://www.geonames.org). Rows are loaded by supabase/seed/postcodes.sql, not here.
create table if not exists public.postcodes (
  postcode text not null check (postcode ~ '^[0-9]{4}$'),
  suburb text not null,
  state text not null,
  lat double precision not null,
  lng double precision not null,
  primary key (postcode, suburb, state)
);
alter table public.postcodes enable row level security;
drop policy if exists postcodes_read on public.postcodes;
create policy postcodes_read on public.postcodes for select using (true);
grant select on public.postcodes to anon, authenticated;
grant all on public.postcodes to service_role;

-- Where a maker's studio is, for distance and in-person fittings (set in Shop settings).
alter table public.makers add column if not exists studio_postcode text
  check (studio_postcode is null or studio_postcode ~ '^[0-9]{4}$');
alter table public.makers add column if not exists studio_lat double precision;
alter table public.makers add column if not exists studio_lng double precision;

create sequence if not exists public.custom_request_number_seq start 1042;
grant usage, select on sequence public.custom_request_number_seq to authenticated, service_role;

create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('OO-C-' || nextval('public.custom_request_number_seq')),
  buyer_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'quoted', 'accepted', 'expired', 'cancelled', 'help_requested')),
  kind text not null default 'dress',
  occasion text,
  occasion_other text check (occasion_other is null or char_length(occasion_other) <= 120),
  needed_by date,
  words text check (words is null or char_length(words) <= 2000),
  link text check (link is null or char_length(link) <= 500),
  inspiration jsonb not null default '[]'
    check (jsonb_typeof(inspiration) = 'array' and jsonb_array_length(inspiration) <= 6),
  source_listing_id uuid references public.products (id) on delete set null,
  fabrics text[] not null default '{}',
  details text[] not null default '{}',
  -- A colour name, 'custom:#RRGGBB' or 'makers_choice'.
  colour text check (colour is null or char_length(colour) <= 40),
  pattern text not null default 'plain',
  fit_mode text check (fit_mode is null or fit_mode in ('saved', 'measurements', 'fitting')),
  -- bust, waist, hips, height, shoulder, arm, nape_waist, waist_floor (cm).
  measurements jsonb,
  budget_min integer check (budget_min is null or budget_min >= 0),
  budget_max integer check (budget_max is null or budget_max >= 0),
  postcode text check (postcode is null or postcode ~ '^[0-9]{4}$'),
  suburb text,
  state text,
  lat double precision,
  lng double precision,
  reach text not null default 'both' check (reach in ('both', 'near')),
  anonymous boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz
);
create index if not exists custom_requests_buyer_idx on public.custom_requests (buyer_id, created_at desc);
alter table public.custom_requests enable row level security;
-- Buyers see and edit their own; makers never read this table directly (see maker_request_view).
drop policy if exists custom_requests_own on public.custom_requests;
create policy custom_requests_own on public.custom_requests for all
  using (buyer_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.custom_requests to authenticated;
grant all on public.custom_requests to service_role;

create table if not exists public.custom_request_recipients (
  request_id uuid not null references public.custom_requests (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  match_score real not null default 0,
  match_reasons text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'quoted', 'passed', 'expired', 'not_chosen', 'chosen')),
  pass_reason text check (pass_reason is null or pass_reason in ('booked', 'not_my_thing', 'budget', 'date')),
  reply_by timestamptz,
  viewed_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (request_id, maker_id)
);
create index if not exists custom_request_recipients_maker_idx
  on public.custom_request_recipients (maker_id, status, reply_by);
alter table public.custom_request_recipients enable row level security;
-- The buyer sees who they asked (and never the pass reason in the app); a maker sees their own row.
drop policy if exists custom_request_recipients_read on public.custom_request_recipients;
create policy custom_request_recipients_read on public.custom_request_recipients for select
  using (
    maker_id = public.my_maker_id()
    or exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists custom_request_recipients_maker_update on public.custom_request_recipients;
create policy custom_request_recipients_maker_update on public.custom_request_recipients for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());
drop policy if exists custom_request_recipients_buyer_insert on public.custom_request_recipients;
create policy custom_request_recipients_buyer_insert on public.custom_request_recipients for insert
  with check (
    exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );
grant select, insert, update on public.custom_request_recipients to authenticated;
grant all on public.custom_request_recipients to service_role;

create table if not exists public.custom_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_requests (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete cascade,
  -- A$ cents, fabric included.
  price integer not null check (price > 0),
  ready_by date not null,
  fittings text not null default 'none' check (fittings in ('none', 'studio_one', 'studio_two', 'video')),
  fabric text check (fabric is null or char_length(fabric) <= 200),
  note text not null check (char_length(note) between 20 and 2000),
  sketch_path text,
  can_make_to_measurements boolean not null check (can_make_to_measurements),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'withdrawn', 'expired')),
  valid_until timestamptz not null default (now() + interval '7 days'),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, maker_id)
);
alter table public.custom_quotes enable row level security;
drop policy if exists custom_quotes_read on public.custom_quotes;
create policy custom_quotes_read on public.custom_quotes for select
  using (
    maker_id = public.my_maker_id()
    or exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );
-- A maker can quote only on a request sent to them.
drop policy if exists custom_quotes_maker_write on public.custom_quotes;
create policy custom_quotes_maker_write on public.custom_quotes for insert
  with check (
    (maker_id = public.my_maker_id() and exists (
      select 1 from public.custom_request_recipients x
      where x.request_id = custom_quotes.request_id and x.maker_id = custom_quotes.maker_id))
    or public.is_admin()
  );
drop policy if exists custom_quotes_maker_update on public.custom_quotes;
create policy custom_quotes_maker_update on public.custom_quotes for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());
grant select, insert, update on public.custom_quotes to authenticated;
grant all on public.custom_quotes to service_role;

-- Custom orders: one order per accepted quote, with making milestones.
alter table public.orders add column if not exists order_type text not null default 'standard'
  check (order_type in ('standard', 'custom'));
alter table public.orders add column if not exists custom_quote_id uuid references public.custom_quotes (id) on delete set null;
-- { sketch_shared | fabric_bought | fitting | made | sent: { at, photo?, note? } }
alter table public.orders add column if not exists milestones jsonb not null default '{}';
-- A custom piece has no listing or size behind it.
alter table public.order_items alter column product_id drop not null;
alter table public.order_items alter column variant_id drop not null;
alter table public.order_items add column if not exists custom_quote_id uuid references public.custom_quotes (id) on delete set null;

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_requests (id) on delete cascade,
  buyer_id uuid not null references public.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 2000),
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'matched', 'closed')),
  assigned_to uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.help_requests enable row level security;
drop policy if exists help_requests_own on public.help_requests;
create policy help_requests_own on public.help_requests for select
  using (buyer_id = auth.uid() or public.is_admin());
drop policy if exists help_requests_insert on public.help_requests;
create policy help_requests_insert on public.help_requests for insert
  with check (buyer_id = auth.uid() or public.is_admin());
drop policy if exists help_requests_admin on public.help_requests;
create policy help_requests_admin on public.help_requests for update
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.help_requests to authenticated;
grant all on public.help_requests to service_role;

-- What a maker sees of a request sent to them. Never the postcode or exact location; the buyer's
-- first name only once that maker's quote is accepted (or if they didn't ask anonymously). Runs
-- as its owner (it reads the buyer-only tables) and filters to the signed-in maker itself.
create or replace view public.maker_request_view as
  select r.id, r.number, r.status as request_status, r.kind, r.occasion, r.occasion_other, r.needed_by,
    r.words, r.link, r.inspiration, r.source_listing_id, r.fabrics, r.details, r.colour, r.pattern,
    r.fit_mode, r.measurements, r.budget_min, r.budget_max, r.suburb, r.state, r.reach, r.anonymous,
    r.sent_at, r.expires_at,
    x.maker_id, x.status as recipient_status, x.match_score, x.match_reasons, x.pass_reason,
    x.reply_by, x.viewed_at,
    (select count(*)::int - 1 from public.custom_request_recipients o where o.request_id = r.id) as other_makers,
    case when not r.anonymous or x.status = 'chosen'
      then split_part(coalesce(u.display_name, ''), ' ', 1) end as buyer_first_name
  from public.custom_requests r
  join public.custom_request_recipients x on x.request_id = r.id
  left join public.users u on u.id = r.buyer_id
  where x.maker_id = public.my_maker_id() and r.status <> 'draft';
revoke all on public.maker_request_view from anon;
grant select on public.maker_request_view to authenticated, service_role;
