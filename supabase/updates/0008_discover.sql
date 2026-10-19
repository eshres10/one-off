-- One Off update: Discover feed, mega menu featured makers, image sizes for the masonry,
-- and public product questions (migration 0008).
-- Run 0007_app_shell.sql first if it hasn't been run yet.
-- Paste into Supabase Dashboard > SQL Editor and click Run. Safe to run more than once.

begin;

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

-- Image sizes for photos already uploaded (new uploads record theirs automatically).
-- The Dylan Dylan preview photos are 1024 x 1536.
update public.product_images
set width = 1024, height = 1536
where public_url like '/preview/dylan-dylan/%' and width is null;

commit;
