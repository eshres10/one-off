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
