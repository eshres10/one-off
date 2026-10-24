-- Featured maker on the homepage hero. Admins swap the maker without a deploy.
-- product_ids is the rotation order. The active feature is the newest started row that is
-- active and not ended. The hero only shows it while the maker's shop is live.

create table if not exists public.home_features (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  headline text check (headline is null or char_length(headline) between 1 and 80),
  blurb text check (blurb is null or char_length(blurb) between 1 and 240),
  product_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(product_ids) <= 10),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint home_features_dates check (ends_at is null or ends_at > starts_at)
);

create index if not exists home_features_active_idx
  on public.home_features (starts_at desc) where is_active;
create index if not exists home_features_maker_idx on public.home_features (maker_id);

alter table public.home_features enable row level security;
revoke all on public.home_features from anon, authenticated;
grant all on public.home_features to service_role;
grant select on public.home_features to anon, authenticated;
grant insert, update, delete on public.home_features to authenticated;

drop policy if exists home_features_read_active on public.home_features;
create policy home_features_read_active on public.home_features for select
  using (is_active);
drop policy if exists home_features_admin_all on public.home_features;
create policy home_features_admin_all on public.home_features for all
  using (public.is_admin()) with check (public.is_admin());

-- First feature: Dramalicious, eight pieces in this order. Looked up by slug, so it is safe to
-- re-run and does nothing where the maker or its pieces do not exist (local and test databases).
do $$
declare
  mk uuid;
  ids uuid[];
begin
  select id into mk from public.makers where slug = 'dramalicious';
  if mk is null then return; end if;
  select array_agg(p.id order by s.ord) into ids
  from unnest(array[
    'sparkle-dress', 'trench-coat', 'tan-double-breasted-suit', 'yellow-skirt',
    'moss-suit', 'olive-leather-jacket', 'sparkle-bag', 'pointed-heel-shoes'
  ]) with ordinality as s(slug, ord)
  join public.products p on p.slug = s.slug and p.maker_id = mk;
  if ids is null or cardinality(ids) < 2 then return; end if;
  if exists (select 1 from public.home_features where maker_id = mk and product_ids = ids) then
    return;
  end if;
  update public.home_features set is_active = false where is_active;
  insert into public.home_features (maker_id, product_ids) values (mk, ids);
end $$;
