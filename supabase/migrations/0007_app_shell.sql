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
