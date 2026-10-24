-- Production setup for 0022_home_features.sql, in the "do $$" form the Supabase SQL tool accepts.
-- Step 1 (already applied on 2026-10-24): the table and indexes, i.e. the first two statements
-- of supabase/migrations/0022_home_features.sql.
-- Step 2: row level security, grants and policies. NOT YET APPLIED when this was written: until it
-- is, the table is open to the public API key. Run this first.
do $$
begin
  alter table public.home_features enable row level security;
  revoke all on public.home_features from anon, authenticated;
  grant all on public.home_features to service_role;
  grant select on public.home_features to anon, authenticated;
  grant insert, update, delete on public.home_features to authenticated;
  drop policy if exists home_features_read_active on public.home_features;
  create policy home_features_read_active on public.home_features for select using (is_active);
  drop policy if exists home_features_admin_all on public.home_features;
  create policy home_features_admin_all on public.home_features for all
    using (public.is_admin()) with check (public.is_admin());
end $$;

-- Step 3: feature Dramalicious (eight pieces, in order). Safe to re-run.
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
