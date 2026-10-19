-- One Off update: seller applications and approval, founding spots, spot checks, launch mode and
-- the returns default (migration 0011). Run supabase/updates/0010_onboarding.sql first if you haven't.
-- Paste into Supabase Dashboard > SQL Editor and click Run. Safe to run more than once.

begin;

-- Seller applications and approval, founding spots, spot checks and launch mode.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.
--
-- "Shops" are rows in public.makers. Makers apply at /sell/apply; nobody lists or sells until
-- an admin approves them. Invited makers (/claim/[token]) are pre-approved and skip review.

-- ---------------------------------------------------------------------------
-- Shop status: draft (application not sent yet), applied, changes_requested, approved,
-- live, holiday, declined, closed, invited. Buyers only ever see live and holiday shops.
-- ---------------------------------------------------------------------------
alter table public.makers drop constraint if exists makers_shop_status_check;
alter table public.makers add constraint makers_shop_status_check check (shop_status in (
  'draft', 'applied', 'changes_requested', 'approved', 'live', 'holiday', 'declined', 'closed', 'invited'));

alter table public.makers add column if not exists applied_at timestamptz;
alter table public.makers add column if not exists reviewed_at timestamptz;
alter table public.makers add column if not exists reviewed_by uuid references public.users (id) on delete set null;
-- Shown to the maker (changes requested, or the reason for a decline).
alter table public.makers add column if not exists review_note text;
alter table public.makers add column if not exists can_reapply_after date;
alter table public.makers add column if not exists source text not null default 'application';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'makers_source_check') then
    alter table public.makers add constraint makers_source_check check (source in ('invite', 'application'));
  end if;
end $$;
-- The application being written (answers + photos), saved after every step. Each submission is
-- copied into shop_applications, which keeps it as it was sent.
alter table public.makers add column if not exists application jsonb not null default '{}'::jsonb;
-- Pieces still to be spot-checked after approval (3 for a newly approved applicant).
alter table public.makers add column if not exists spot_checks_left integer not null default 0;
create index if not exists makers_applied_idx on public.makers (applied_at) where shop_status = 'applied';

update public.makers set source = 'invite' where created_by_admin and source <> 'invite';

-- ---------------------------------------------------------------------------
-- Submitted applications: one row per submission, never edited (only the decision is filled in).
-- ---------------------------------------------------------------------------
create table if not exists public.shop_applications (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  answers jsonb not null,
  photo_urls text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  decision text check (decision in ('approved', 'changes_requested', 'declined')),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null,
  decision_note text
);
create index if not exists shop_applications_maker_idx on public.shop_applications (maker_id, submitted_at desc);

create or replace function public.guard_shop_application() returns trigger
language plpgsql as $$
begin
  if new.answers is distinct from old.answers or new.photo_urls is distinct from old.photo_urls
     or new.submitted_at is distinct from old.submitted_at or new.maker_id is distinct from old.maker_id then
    raise exception 'Submitted applications can’t be changed' using errcode = 'insufficient_privilege';
  end if;
  if old.decision is not null and new.decision is distinct from old.decision then
    raise exception 'This application already has a decision' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
drop trigger if exists shop_applications_guard on public.shop_applications;
create trigger shop_applications_guard before update on public.shop_applications
  for each row execute function public.guard_shop_application();

-- Admin-only notes about a shop (kept out of public.makers, which the maker can read).
create table if not exists public.shop_internal_notes (
  maker_id uuid primary key references public.makers (id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Spot checks: the first pieces a newly approved shop publishes are flagged for a quick look.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists spot_check boolean not null default false;
alter table public.products add column if not exists spot_checked_at timestamptz;
alter table public.products add column if not exists spot_check_note text;
create index if not exists products_spot_check_idx on public.products (published_at) where spot_check and spot_checked_at is null;

-- ---------------------------------------------------------------------------
-- Site settings the admin can change without a deploy (launch mode, opening date).
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Publishing needs an approved (or live) shop: checked here and in the RLS policies below.
-- ---------------------------------------------------------------------------
create or replace function public.shop_can_publish(p_maker_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.makers m
    where m.id = p_maker_id and m.shop_status in ('approved', 'live', 'holiday')
  )
$$;

-- Uses up one of the shop's spot checks (runs as the owner, past the maker-update guard). Only
-- from the product trigger: a direct call does nothing.
create or replace function public.take_spot_check(p_maker_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 then return false; end if;
  update public.makers set spot_checks_left = spot_checks_left - 1
    where id = p_maker_id and spot_checks_left > 0;
  return found;
end
$$;

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
        if new.status = 'approved' and coalesce(shop, '') not in ('approved', 'live', 'holiday') then
          raise exception 'You can publish pieces once your shop is approved' using errcode = 'insufficient_privilege';
        end if;
      end if;
      if new.is_featured is distinct from old.is_featured
         or new.maker_id is distinct from old.maker_id
         or new.listed_by_admin is distinct from old.listed_by_admin
         or new.view_count is distinct from old.view_count
         or new.save_count is distinct from old.save_count
         or new.spot_check is distinct from old.spot_check
         or new.spot_checked_at is distinct from old.spot_checked_at
         or new.spot_check_note is distinct from old.spot_check_note then
        raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.published_at := now();
    -- First publish of a piece from a newly approved shop: flag it for a spot check.
    if not new.spot_check and new.spot_checked_at is null and public.take_spot_check(new.maker_id) then
      new.spot_check := true;
    end if;
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
       or new.bank_last4 is distinct from old.bank_last4
       or new.applied_at is distinct from old.applied_at
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by
       or new.review_note is distinct from old.review_note
       or new.can_reapply_after is distinct from old.can_reapply_after
       or new.source is distinct from old.source
       or new.spot_checks_left is distinct from old.spot_checks_left then
      raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

-- Buyers only see live (or on-holiday) shops and their published pieces.
create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.makers m on m.id = p.maker_id
    where p.id = p_product_id and p.status = 'approved' and m.status = 'approved'
      and m.shop_status in ('live', 'holiday')
  )
$$;

drop policy if exists makers_select on public.makers;
create policy makers_select on public.makers for select
  using ((status = 'approved' and shop_status in ('live', 'holiday')) or user_id = auth.uid() or public.is_admin());

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert
  with check (
    (maker_id = public.my_maker_id() and (status <> 'approved' or public.shop_can_publish(maker_id)))
    or public.is_admin());
drop policy if exists products_update on public.products;
create policy products_update on public.products for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (
    (maker_id = public.my_maker_id() and (status <> 'approved' or public.shop_can_publish(maker_id)))
    or public.is_admin());

alter table public.shop_applications enable row level security;
alter table public.shop_internal_notes enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists shop_applications_read on public.shop_applications;
create policy shop_applications_read on public.shop_applications for select
  using (public.is_admin() or maker_id = public.my_maker_id());
drop policy if exists shop_applications_admin on public.shop_applications;
create policy shop_applications_admin on public.shop_applications for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists shop_internal_notes_admin on public.shop_internal_notes;
create policy shop_internal_notes_admin on public.shop_internal_notes for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select using (true);
drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

grant select, update on public.shop_applications to authenticated;
grant select, insert, update, delete on public.shop_internal_notes to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
grant all on public.shop_applications, public.shop_internal_notes, public.site_settings to service_role;

-- ---------------------------------------------------------------------------
-- Existing rows. Invited shops keep their status. Self-sign-up shops that hadn't gone live become
-- applications waiting for review: their founding number (given automatically at sign-up) is
-- released for the admin to award, and pieces waiting to go live go back to drafts.
-- ---------------------------------------------------------------------------
update public.products p set status = 'draft'
  from public.makers m
  where p.maker_id = m.id and m.self_signup and m.shop_status = 'draft' and p.status = 'pending';
update public.makers set shop_status = 'applied', applied_at = coalesce(applied_at, created_at),
    founding_number = null, founding_until = null,
    application = application || jsonb_build_object('name', display_name, 'suburb', location,
      'instagram', instagram, 'makes', to_jsonb(tags), 'modes', to_jsonb(sell_modes))
  where self_signup and shop_status = 'draft';
insert into public.shop_applications (maker_id, answers, submitted_at)
  select m.id, m.application, m.applied_at from public.makers m
  where m.shop_status = 'applied'
    and not exists (select 1 from public.shop_applications a where a.maker_id = m.id);

-- ---------------------------------------------------------------------------
-- The old per-shop returns default promised 14-day returns, which contradicts the marketplace
-- policy (no change-of-mind returns). Replace it wherever it was never edited.
-- ---------------------------------------------------------------------------
alter table public.makers alter column return_policy set default
  'No change-of-mind returns. Faulty or not as described? We''ll make it right.';
update public.makers set return_policy = 'No change-of-mind returns. Faulty or not as described? We''ll make it right.'
  where return_policy ilike 'Returns accepted within 14 days%';

-- ---------------------------------------------------------------------------
-- Discover: the place filter matches a maker's suburb or their city ("By city" in the menu).
-- Same as 0010 otherwise.
-- ---------------------------------------------------------------------------
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
      and (p_suburb is null or lower(trim(split_part(coalesce(m.location, m.city, ''), ',', 1))) = lower(p_suburb)
        or lower(m.city) = lower(p_suburb))
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


commit;
