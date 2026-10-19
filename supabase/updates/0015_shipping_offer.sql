-- One Off update: shipping offers — maker bundle deals and the cross-maker shipping cap (migration 0015).
-- Run supabase/updates/0014_change_of_mind_returns.sql first if you haven't.
-- Paste into Supabase Dashboard > SQL Editor (new query) and click Run. Safe to run more than once.

begin;

-- Shipping offers: maker bundle deals and One Off's cross-maker shipping cap.
-- Re-runnable: every statement is guarded.
--
-- Each parcel now has three prices:
--   shipping_list_cents   the maker's normal rate for the parcel (before any deal)
--   shipping_cents        what the maker is paid for shipping (after their own free-over / bundle deal)
--   buyer_shipping_cents  what the buyer paid (after One Off's cap or free-shipping threshold)
-- One Off covers shipping_subsidy_cents = shipping_cents - buyer_shipping_cents, paid to the maker
-- as a separate transfer from the platform balance (see releaseShippingSubsidies).
-- Older rows have null list/buyer prices: read them as shipping_cents.

-- Maker bundle deal: free or discounted standard shipping on 2+ pieces in one parcel (maker-funded).
alter table public.makers add column if not exists bundle_shipping text not null default 'none';
alter table public.makers add column if not exists bundle_percent_off integer;
alter table public.makers add column if not exists bundle_min_pieces integer not null default 2;
do $$ begin
  alter table public.makers add constraint makers_bundle_shipping_check
    check (bundle_shipping in ('none', 'free', 'percent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.makers add constraint makers_bundle_percent_check
    check (bundle_percent_off is null or bundle_percent_off between 5 and 90);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.makers add constraint makers_bundle_min_check
    check (bundle_min_pieces between 2 and 10);
exception when duplicate_object then null; end $$;

alter table public.fulfilments add column if not exists shipping_list_cents integer;
alter table public.fulfilments add column if not exists buyer_shipping_cents integer;
alter table public.fulfilments add column if not exists shipping_subsidy_cents integer not null default 0;
alter table public.fulfilments add column if not exists shipping_subsidy_status text not null default 'none';
alter table public.fulfilments add column if not exists shipping_subsidy_transfer_id text;
do $$ begin
  alter table public.fulfilments add constraint fulfilments_shipping_subsidy_check
    check (shipping_subsidy_cents >= 0
      and shipping_subsidy_status in ('none', 'pending', 'created', 'failed')
      and (buyer_shipping_cents is null or buyer_shipping_cents >= 0)
      and (shipping_list_cents is null or shipping_list_cents >= 0));
exception when duplicate_object then null; end $$;
create index if not exists fulfilments_subsidy_due_idx on public.fulfilments (shipping_subsidy_status)
  where shipping_subsidy_status in ('pending', 'failed');

-- What the buyer saved on shipping across the order, and which offer did it ('cap' or 'free_over').
alter table public.orders add column if not exists shipping_saving_cents integer not null default 0;
alter table public.orders add column if not exists shipping_offer text;
do $$ begin
  alter table public.orders add constraint orders_shipping_offer_check
    check (shipping_saving_cents >= 0 and (shipping_offer is null or shipping_offer in ('cap', 'free_over')));
exception when duplicate_object then null; end $$;

-- Default offer, switched off until One Off can afford it (admins turn it on at /admin/shipping):
-- first maker's rate, +A$5 for each extra maker, never more than A$20, free over A$300, with an
-- A$500 monthly budget for what One Off covers. Makers' bundle deals work either way.
insert into public.site_settings (key, value)
values ('shipping_offer', '{"enabled": false, "extraMakerCents": 500, "capCents": 2000, "freeOverCents": 30000, "monthlyBudgetCents": 50000}'::jsonb)
on conflict (key) do nothing;

-- Payouts with a subsidy: the main transfer (from the buyer's charge) and the covered shipping
-- (from the platform balance) are worked out together when the maker is paid.
alter table public.fulfilments add column if not exists transfer_amount_cents integer;
alter table public.fulfilments add column if not exists transfer_reversed_cents integer not null default 0;
alter table public.fulfilments add column if not exists shipping_subsidy_due_cents integer;
alter table public.fulfilments add column if not exists shipping_subsidy_attempts integer not null default 0;

-- The offer a checkout was priced with, kept for a while so the total can't change between
-- what the buyer sees and what they're charged (budget used up, admin edits, month rolls over).
alter table public.orders add column if not exists shipping_offer_snapshot jsonb;
alter table public.orders add column if not exists shipping_offer_locked_at timestamptz;

commit;
