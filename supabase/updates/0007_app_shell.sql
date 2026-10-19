-- One Off update: app shell, search, saved alerts, homepage rails, product conversations,
-- seed placeholders and store-sync columns (migration 0007).
-- Paste into Supabase Dashboard > SQL Editor and click Run. Safe to run more than once.

begin;

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

commit;
