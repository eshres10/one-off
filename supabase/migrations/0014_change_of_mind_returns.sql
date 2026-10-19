-- Change-of-mind returns for ready-to-ship pieces (14 days, unworn with tags). Made-to-order,
-- custom and one-of-one pieces stay non-returnable for a change of mind; faults go through
-- "Report a problem" as before. Re-runnable: every statement is guarded.

-- The policy each item was sold under, copied at checkout so later changes never touch it.
alter table public.order_items add column if not exists return_policy jsonb;
-- Items sold before this change were sold under "no change-of-mind returns" on everything.
update public.order_items set return_policy = jsonb_build_object(
    'type', product_type::text, 'changeOfMind', false, 'windowDays', null,
    'summary', 'No change-of-mind returns. Faulty or not as described? We''ll make it right.')
  where return_policy is null;

-- Where buyers post a return. Shown to the buyer only once they've started one.
alter table public.makers add column if not exists return_address text
  check (return_address is null or char_length(return_address) <= 400);

create sequence if not exists public.return_number_seq start 1001;

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('OO-R-' || nextval('public.return_number_seq')),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  buyer_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid not null references public.makers (id) on delete restrict,
  reason text check (reason in ('doesnt_fit', 'not_for_me', 'too_late', 'other')),
  reason_note text check (reason_note is null or char_length(reason_note) <= 1000),
  status text not null default 'requested'
    check (status in ('requested', 'in_transit', 'received', 'refunded', 'rejected', 'cancelled', 'disputed')),
  carrier text check (carrier is null or carrier in ('auspost', 'sendle', 'other')),
  tracking text check (tracking is null or char_length(tracking) <= 80),
  requested_at timestamptz not null default now(),
  -- When tracking (or the admin) says it reached the maker; starts the maker's confirm clock.
  delivered_at timestamptz,
  confirm_by timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  refund_amount integer check (refund_amount is null or refund_amount > 0),
  refund_source text check (refund_source in ('maker', 'auto', 'admin')),
  maker_note text check (maker_note is null or char_length(maker_note) <= 2000),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  claim_id uuid references public.return_claims (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists returns_maker_idx on public.returns (maker_id, status, requested_at desc);
create index if not exists returns_buyer_idx on public.returns (buyer_id, requested_at desc);
create index if not exists returns_open_idx on public.returns (status) where status in ('requested', 'in_transit');
-- One live return per item.
create unique index if not exists returns_one_live
  on public.returns (order_item_id) where status not in ('cancelled', 'rejected');

-- A maker's "There's a problem with it" opens a case for One Off to decide.
alter type claim_reason add value if not exists 'return_condition';
alter table public.return_claims add column if not exists return_id uuid references public.returns (id) on delete set null;

-- Deductions from a maker's next payout now also come from returns.
alter table public.maker_adjustments add column if not exists return_id uuid references public.returns (id) on delete set null;

alter table public.returns enable row level security;
drop policy if exists returns_read on public.returns;
create policy returns_read on public.returns for select
  using (buyer_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
grant select on public.returns to authenticated;
grant all on public.returns to service_role;
grant usage on sequence public.return_number_seq to service_role;

-- The shop-level policy text set by 0011 now reads per piece type.
update public.makers set return_policy = 'Ready-to-ship pieces can be returned within 14 days if unworn, with tags. Made-to-order, custom and one-of-one pieces can''t be returned for a change of mind. Faulty or not as described? We''ll make it right.'
  where return_policy = 'No change-of-mind returns. Faulty or not as described? We''ll make it right.';
alter table public.makers alter column return_policy set default 'Ready-to-ship pieces can be returned within 14 days if unworn, with tags. Made-to-order, custom and one-of-one pieces can''t be returned for a change of mind. Faulty or not as described? We''ll make it right.';
