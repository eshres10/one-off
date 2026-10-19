-- One Off update: onboarding, taste picker, tours, maker messages and seller self-sign-up (migration 0010).
-- Run supabase/updates/0009_studio.sql first if you haven't. Paste into Supabase Dashboard > SQL Editor
-- and click Run. Safe to run more than once.

begin;

-- Onboarding, taste picker and scroll effects.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.

-- ---------------------------------------------------------------------------
-- Homepage hero: the velvet sofa image replaces the linen suit (only if it wasn't changed since).
-- ---------------------------------------------------------------------------
update public.editorial_placements set image_url = '/seed/hero-velvet-sofa.jpg'
  where slot = 'home_hero' and image_url = '/seed/hero-linen-suit.jpg';

-- ---------------------------------------------------------------------------
-- Style tags: a fixed vocabulary (lib/taste/tags.ts) makers pick up to four of per piece.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists style_tags text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_style_tags_vocab') then
    alter table public.products add constraint products_style_tags_vocab check (
      cardinality(style_tags) <= 4 and style_tags <@ array[
        'Satin', 'Linen', 'Cotton', 'Lace & crochet', 'Knit',
        'Neutrals', 'Soft colour', 'Bold colour', 'Earthy', 'Monochrome',
        'Minimal', 'Romantic', 'Statement', 'Tailoring', 'Evening', 'Holiday']::text[]);
  end if;
end $$;
create index if not exists products_style_tags_idx on public.products using gin (style_tags);

-- A first guess at a piece's style from its title, fabric and colours: one fabric, one colour
-- group and up to two moods. Used to tag existing pieces; makers can change them.
create or replace function public.infer_style_tags(
  p_title text, p_fabric text, p_colours text[], p_category text, p_description text default ''
) returns text[]
language plpgsql immutable as $$
declare
  t text := lower(coalesce(p_title, '') || ' ' || coalesce(p_fabric, ''));
  d text := lower(coalesce(p_description, ''));
  c text := lower(array_to_string(coalesce(p_colours, '{}'), ' '));
  tags text[] := '{}';
  moods text[] := '{}';
begin
  tags := tags || case
    when t ~ 'lace|crochet' then 'Lace & crochet'
    when t ~ 'satin|silk|charmeuse' then 'Satin'
    when t ~ 'knit|merino|wool' then 'Knit'
    when t ~ 'linen' then 'Linen'
    when t ~ 'cotton|poplin|denim|chambray' then 'Cotton'
    else null end;
  tags := tags || case
    when c = '' then null
    when c ~ '^(black|ivory|white)( (black|ivory|white))*$' then 'Monochrome'
    when c ~ 'scarlet|tangerine|emerald|cobalt|fuchsia|red' then 'Bold colour'
    when c ~ 'rust|olive|chocolate|brown|khaki|tan|wine|terracotta' then 'Earthy'
    when c ~ 'blush|butter|sage|lilac|pink|sky|mint' then 'Soft colour'
    else 'Neutrals' end;
  if t ~ 'blazer|suit|trouser|tailor|waistcoat|jacket' then moods := array_append(moods, 'Tailoring'); end if;
  if t ~ 'gown|column|satin|silk' or p_category = 'occasionwear' then moods := array_append(moods, 'Evening'); end if;
  if t ~ 'lace|ruffle|tier|floral|bow|puff' then moods := array_append(moods, 'Romantic'); end if;
  if t ~ 'corset|sequin|cape|sculpt|statement' or c ~ 'scarlet|tangerine|emerald' then moods := array_append(moods, 'Statement'); end if;
  if t ~ 'linen|crochet|kaftan|resort|sun|halter' or d ~ 'holiday|summer|beach' then moods := array_append(moods, 'Holiday'); end if;
  if t ~ 'slip|shift|column|tank|shirt' and not (moods && array['Romantic', 'Statement']) then moods := array_append(moods, 'Minimal'); end if;
  if cardinality(moods) = 0 then moods := array['Minimal']; end if;
  return (array_remove(tags, null) || moods[1:2])[1:4];
end $$;

update public.products set style_tags = public.infer_style_tags(title, fabric_composition, colours, category, description)
  where style_tags = '{}';

-- ---------------------------------------------------------------------------
-- Shopper preferences from onboarding, and the taste profile that ranks their feed.
-- taste_tags maps a style tag to a weight; picks add 1 per tag, later saves 1, add to bag 2,
-- purchases 3, a long quick view 0.25, all decaying gently (half-life of about three weeks).
-- ---------------------------------------------------------------------------
create table if not exists public.customer_prefs (
  user_id uuid primary key references public.users (id) on delete cascade,
  sizes text[] not null default '{}',
  height_band text check (height_band in ('under-165', '165-175', 'over-175')),
  occasions text[] not null default '{}',
  taste_tags jsonb not null default '{}'::jsonb,
  taste_picks uuid[] not null default '{}',
  taste_updated_at timestamptz,
  onboarding_step integer not null default 0 check (onboarding_step between 0 and 6),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists customer_prefs_touch on public.customer_prefs;
create trigger customer_prefs_touch before update on public.customer_prefs
  for each row execute function public.touch_updated_at();

alter table public.customer_prefs enable row level security;
drop policy if exists customer_prefs_own on public.customer_prefs;
create policy customer_prefs_own on public.customer_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.customer_prefs to authenticated;
grant all on public.customer_prefs to service_role;

-- First-visit tours, shown once each unless replayed.
alter table public.users add column if not exists tour_completed_at timestamptz;
alter table public.users add column if not exists studio_tour_completed_at timestamptz;
-- People who signed up before the tours existed skip them (they can replay from Help).
update public.users set tour_completed_at = coalesce(tour_completed_at, created_at),
  studio_tour_completed_at = coalesce(studio_tour_completed_at, created_at)
  where created_at < '2026-10-20';

-- Adds a piece's tags to a shopper's taste, after decaying what's there since the last change.
create or replace function public.bump_taste(p_user uuid, p_product uuid, p_weight numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tags text[];
  prefs public.customer_prefs;
  decay numeric;
  out_tags jsonb := '{}'::jsonb;
  k text;
  v numeric;
begin
  select style_tags into tags from public.products where id = p_product;
  if tags is null or cardinality(tags) = 0 then return; end if;
  insert into public.customer_prefs (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into prefs from public.customer_prefs where user_id = p_user for update;
  decay := exp(-greatest(0, extract(epoch from now() - coalesce(prefs.taste_updated_at, now())) / 86400) / 30);
  for k, v in select key, value::numeric from jsonb_each_text(prefs.taste_tags) loop
    if v * decay >= 0.05 then out_tags := out_tags || jsonb_build_object(k, round(v * decay, 3)); end if;
  end loop;
  foreach k in array tags loop
    out_tags := out_tags || jsonb_build_object(k, round(coalesce((out_tags ->> k)::numeric, 0) + p_weight, 3));
  end loop;
  update public.customer_prefs set taste_tags = out_tags, taste_updated_at = now() where user_id = p_user;
end $$;
revoke all on function public.bump_taste(uuid, uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discover ranking, now personal: "Relevant" adds a taste match (cosine of the piece's tags
-- against the shopper's weights) and a size match. Signed-out shoppers rank as before.
-- ---------------------------------------------------------------------------
drop function if exists public.discover_feed(text, text, text[], text[], integer, text[], text, text);
create or replace function public.discover_feed(
  p_query text default null,
  p_cat text default null,
  p_sizes text[] default null,
  p_avail text[] default null,
  p_max_cents integer default null,
  p_colours text[] default null,
  p_suburb text default null,
  p_sort text default 'relevant',
  p_user_id uuid default null
)
returns table (product_id uuid, sort_key numeric)
language sql stable security definer set search_path = public as $$
  with prefs as (
    select cp.taste_tags, cp.sizes,
      sqrt(coalesce((select sum(power(value::numeric, 2)) from jsonb_each_text(cp.taste_tags)), 0)) as norm
    from public.customer_prefs cp where cp.user_id = p_user_id
  ),
  base as (
    select p.id, p.price_cents, p.save_count, coalesce(p.approved_at, p.created_at) as listed_at,
      m.rating, p.style_tags,
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
  ),
  scored as (
    select b.*,
      coalesce((
        select case when pr.norm = 0 or cardinality(b.style_tags) = 0 then 0
          else (select coalesce(sum((pr.taste_tags ->> t)::numeric), 0) from unnest(b.style_tags) t)
            / pr.norm / sqrt(cardinality(b.style_tags)) end
        from prefs pr), 0) as taste,
      coalesce((
        select case when cardinality(pr.sizes) = 0 then 0
          when exists (select 1 from public.product_variants v where v.product_id = b.id and v.is_active
            and v.size = any(pr.sizes) and v.stock_quantity > 0) then 1 else 0 end
        from prefs pr), 0) as size_match
    from base b
  )
  select s.id,
    round(case p_sort
      when 'new' then extract(epoch from s.listed_at)::numeric
      when 'popular' then (s.saves14 * 5 + s.save_count)::numeric
      when 'price-asc' then -s.price_cents::numeric
      when 'price-desc' then s.price_cents::numeric
      else (
        100 * s.text_rank
        + 40 * exp(-extract(epoch from date_trunc('hour', now()) - s.listed_at) / 86400 / 30)
        + 10 * ln(1 + s.saves14)
        + 4 * coalesce(s.rating, 0)
        + 60 * s.taste
        + 12 * s.size_match
      )::numeric
    end, 6) as sort_key
  from scored s
$$;
revoke all on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) from public;
grant execute on function public.discover_feed(text, text, text[], text[], integer, text[], text, text, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Makers ↔ One Off: one conversation per maker account ("Message One Off" in Studio, and
-- "Rather we list your first pieces for you?" in seller sign-up). Admins reply from /admin/support.
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  maker_id uuid references public.makers (id) on delete set null,
  from_admin boolean not null default false,
  sender_user_id uuid references public.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  topic text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_user_idx on public.support_messages (user_id, created_at);
alter table public.support_messages enable row level security;
drop policy if exists support_messages_own_read on public.support_messages;
create policy support_messages_own_read on public.support_messages for select using (user_id = auth.uid());
drop policy if exists support_messages_own_write on public.support_messages;
create policy support_messages_own_write on public.support_messages for insert
  with check (user_id = auth.uid() and sender_user_id = auth.uid() and not from_admin);
grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

-- ---------------------------------------------------------------------------
-- Makers who sign up themselves (/sell/start), rather than being set up by One Off. Their shop
-- stays a draft until the first piece is published and payouts are connected.
-- ---------------------------------------------------------------------------
alter table public.makers add column if not exists self_signup boolean not null default false;
alter table public.makers add column if not exists sell_modes text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'makers_sell_modes_check') then
    alter table public.makers add constraint makers_sell_modes_check
      check (sell_modes <@ array['ready_to_ship', 'made_to_order', 'custom']::text[]);
  end if;
end $$;

commit;
