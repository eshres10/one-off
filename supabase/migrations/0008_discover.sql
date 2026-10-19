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
