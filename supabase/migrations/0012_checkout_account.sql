-- Checkout, the buyer account and report a problem.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.
--
-- The brief's tables map onto what already exists: orders, order_shipments = fulfilments (one per
-- maker per order), order_items, buyer_profiles = customer_prefs + buyer_measurements, and
-- cases = return_claims. This adds what's missing to each.

alter type claim_reason add value if not exists 'other';

-- ---------------------------------------------------------------------------
-- Orders: the buyer's mobile (for delivery texts, never shown to makers) and the Stripe
-- transfer group that ties the charge to each maker's transfer.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists buyer_phone text;
alter table public.orders add column if not exists transfer_group text;
alter table public.orders add column if not exists save_details boolean not null default false;
alter table public.orders add column if not exists account_created boolean not null default false;
alter table public.orders add column if not exists checkout_step smallint not null default 1;
-- The bag this checkout came from, and the browser session that owns it (guests have no account).
alter table public.orders add column if not exists cart_id uuid references public.carts (id) on delete set null;
alter table public.orders add column if not exists checkout_session text;
-- The Stripe Customer a card is saved to (a guest's becomes their account's on sign-up).
alter table public.orders add column if not exists stripe_customer_id text;
create index if not exists orders_cart_pending_idx on public.orders (cart_id) where status = 'pending';
update public.orders set transfer_group = id::text where transfer_group is null;

-- ---------------------------------------------------------------------------
-- Shipments (fulfilments): the delivery speed the buyer picked and the maker's payout state.
--   held       paid, waiting for delivery
--   scheduled  delivered; paid out at payout_due_at (delivered + TERMS.releaseDaysAfterDelivery)
--   paused     a problem was reported soon after delivery
--   paid       transferred to the maker
--   reversed   transferred, then reversed after a refund
-- ---------------------------------------------------------------------------
alter table public.fulfilments add column if not exists speed text not null default 'standard';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fulfilments_speed_check') then
    alter table public.fulfilments add constraint fulfilments_speed_check check (speed in ('standard', 'express'));
  end if;
end $$;
alter table public.fulfilments add column if not exists payout_due_at timestamptz;
alter table public.fulfilments add column if not exists payout_status text not null default 'held';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fulfilments_payout_status_check') then
    alter table public.fulfilments add constraint fulfilments_payout_status_check
      check (payout_status in ('held', 'scheduled', 'paused', 'paid', 'reversed'));
  end if;
end $$;
create index if not exists fulfilments_payout_due_idx on public.fulfilments (payout_due_at)
  where payout_status = 'scheduled';

update public.fulfilments set payout_status = 'paid'
  where transfer_released_at is not null and payout_status = 'held';
update public.fulfilments set payout_status = 'reversed'
  where transfer_status = 'reversed' and payout_status <> 'reversed';
update public.fulfilments set payout_status = 'scheduled',
    payout_due_at = coalesce(payout_due_at, delivered_at + interval '3 days')
  where delivered_at is not null and transfer_released_at is null and payout_status = 'held';

-- Items: a note to the maker. Made-to-order measurements are already copied into
-- custom_measurements at checkout.
alter table public.order_items add column if not exists note_to_maker text
  check (note_to_maker is null or char_length(note_to_maker) <= 500);

-- ---------------------------------------------------------------------------
-- Buyer profile: name, usual size and fit, saved addresses and notification choices.
-- ---------------------------------------------------------------------------
alter table public.customer_prefs add column if not exists first_name text;
alter table public.customer_prefs add column if not exists usual_size text;
alter table public.customer_prefs add column if not exists fit_pref text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_prefs_fit_pref_check') then
    alter table public.customer_prefs add constraint customer_prefs_fit_pref_check
      check (fit_pref is null or fit_pref in ('close', 'true', 'relaxed'));
  end if;
end $$;
-- [{ id, label, name, line1, line2, suburb, state, postcode, phone, isDefault }]
alter table public.customer_prefs add column if not exists addresses jsonb not null default '[]'::jsonb;
-- Buyer notification choices live in notification_prefs next to the makers' ones (order and
-- delivery emails are always on, so they have no row): delivery_sms (sms column), maker_messages,
-- following_weekly, one_of_ones_in_size, news (email column).
alter table public.notification_prefs drop constraint if exists notification_prefs_event_check;
alter table public.notification_prefs add constraint notification_prefs_event_check check (event in
  ('new_order', 'ship_by_reminder', 'message', 'low_stock', 'payout_sent', 'weekly_summary',
   'delivery_sms', 'maker_messages', 'following_weekly', 'one_of_ones_in_size', 'news'));

alter table public.buyer_measurements add column if not exists inside_leg_cm numeric(5, 1)
  check (inside_leg_cm is null or inside_leg_cm between 40 and 120);

-- The buyer's Stripe Customer, for cards saved at checkout.
alter table public.users add column if not exists stripe_customer_id text unique;

-- ---------------------------------------------------------------------------
-- Cases (return_claims): a number buyers can quote, what they asked for, which parcel, and when
-- One Off decides if the maker doesn't reply or they don't agree.
-- ---------------------------------------------------------------------------
create sequence if not exists public.case_number_seq start 2001;
alter table public.return_claims add column if not exists case_number text unique;
alter table public.return_claims add column if not exists requested_outcome text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'return_claims_requested_outcome_check') then
    alter table public.return_claims add constraint return_claims_requested_outcome_check
      check (requested_outcome is null or requested_outcome in ('repair', 'replace', 'refund'));
  end if;
end $$;
alter table public.return_claims add column if not exists fulfilment_id uuid references public.fulfilments (id) on delete set null;
alter table public.return_claims add column if not exists platform_due_at timestamptz;
alter table public.return_claims add column if not exists paused_payout boolean not null default false;
-- One Off's own notes on a case: admin only, never shown to the buyer or the maker.
create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.return_claims (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists case_notes_claim_idx on public.case_notes (claim_id, created_at);
alter table public.case_notes enable row level security;
drop policy if exists case_notes_admin on public.case_notes;
create policy case_notes_admin on public.case_notes for all using (public.is_admin()) with check (public.is_admin());
grant select, insert on public.case_notes to authenticated;
grant all on public.case_notes to service_role;
-- Photos are required for faulty / not as described (checked in the app); "something else" can
-- be reported without one.
alter table public.return_claims drop constraint if exists return_claims_photos_check;
alter table public.return_claims add constraint return_claims_photos_check check (cardinality(photos) between 0 and 6);

create or replace function public.next_case_number() returns text
language sql volatile security definer set search_path = public as $$
  select 'OO-C-' || nextval('public.case_number_seq')::text
$$;
revoke execute on function public.next_case_number() from anon, authenticated;
update public.return_claims set case_number = public.next_case_number() where case_number is null;
update public.return_claims c set fulfilment_id = oi.fulfilment_id
  from public.order_items oi where oi.id = c.order_item_id and c.fulfilment_id is null;

-- Money a maker owes after a refund that couldn't be reversed from a transfer: taken from their
-- next payouts.
create table if not exists public.maker_adjustments (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  claim_id uuid references public.return_claims (id) on delete set null,
  fulfilment_id uuid references public.fulfilments (id) on delete set null,
  applied_at timestamptz,
  applied_to_fulfilment_id uuid references public.fulfilments (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists maker_adjustments_open_idx on public.maker_adjustments (maker_id) where applied_at is null;
alter table public.maker_adjustments enable row level security;
drop policy if exists maker_adjustments_read on public.maker_adjustments;
create policy maker_adjustments_read on public.maker_adjustments for select
  using (maker_id = public.my_maker_id() or public.is_admin());
grant select on public.maker_adjustments to authenticated;
grant all on public.maker_adjustments to service_role;

-- ---------------------------------------------------------------------------
-- One-of-one reservations: held for a buyer for SITE.reservationMinutes once they reach payment.
-- The piece is only marked sold when the payment succeeds.
-- ---------------------------------------------------------------------------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (variant_id, order_id)
);
create index if not exists reservations_variant_idx on public.reservations (variant_id, expires_at);
alter table public.reservations enable row level security;
grant all on public.reservations to service_role;

-- ---------------------------------------------------------------------------
-- Makers' own time zone (reminders, greetings, summaries and case due times use it).
-- ---------------------------------------------------------------------------
alter table public.makers add column if not exists timezone text not null default 'Australia/Melbourne';
update public.makers set timezone = case state
    when 'NSW' then 'Australia/Sydney' when 'ACT' then 'Australia/Sydney'
    when 'QLD' then 'Australia/Brisbane' when 'SA' then 'Australia/Adelaide'
    when 'NT' then 'Australia/Darwin' when 'WA' then 'Australia/Perth'
    when 'TAS' then 'Australia/Hobart' else 'Australia/Melbourne' end
  where timezone = 'Australia/Melbourne' and coalesce(state, 'VIC') <> 'VIC';
alter table public.notification_log add column if not exists maker_id uuid references public.makers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Makers never see a buyer's email or phone (messages go through One Off). The orders table is
-- buyer and admin only; makers (and shared buyer/maker screens) read order_summaries, which has
-- everything except the buyer's email and phone.
-- ---------------------------------------------------------------------------
drop view if exists public.maker_orders;
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (buyer_user_id = auth.uid() or public.is_admin());

create or replace view public.order_summaries with (security_barrier = true) as
  select o.id, o.order_number, o.buyer_user_id, o.buyer_name, o.status, o.subtotal_cents, o.shipping_total_cents,
    o.total_cents, o.refunded_cents, o.currency, o.shipping_address, o.gift_note, o.agreed_spec, o.returns_ack_at,
    o.external_store, o.paid_at, o.created_at, o.updated_at
  from public.orders o
  where o.buyer_user_id = auth.uid() or public.is_order_maker(o.id) or public.is_admin();
grant select on public.order_summaries to authenticated;
