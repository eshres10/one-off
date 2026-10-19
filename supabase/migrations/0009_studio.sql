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
alter table public.cart_items add column if not exists gift_note text;
alter table public.carts add column if not exists gift_note text
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
