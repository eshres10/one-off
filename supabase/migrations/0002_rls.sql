-- Row Level Security. Server code runs user-scoped queries as the `authenticated` role with
-- request.jwt.claims set (see lib/db/index.ts), exactly as Supabase PostgREST does, so these
-- policies are the real enforcement boundary for buyer/seller data.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

-- Exposes only a first name so makers can address buyers without reading the users table.
create or replace function public.user_first_name(p_user_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select split_part(coalesce(display_name, 'Shopper'), ' ', 1) from public.users where id = p_user_id
$$;

create or replace function public.my_maker_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.makers where user_id = auth.uid()
$$;

create or replace function public.is_order_buyer(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders where id = p_order_id and buyer_user_id = auth.uid())
$$;

create or replace function public.is_order_maker(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fulfilments f
    where f.order_id = p_order_id and f.maker_id = public.my_maker_id()
  )
$$;

create or replace function public.is_thread_participant(p_thread_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (t.buyer_user_id = auth.uid() or t.maker_id = public.my_maker_id())
  )
$$;

create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p join public.makers m on m.id = p.maker_id
    where p.id = p_product_id and p.status = 'approved' and m.status = 'approved'
  )
$$;

create or replace function public.owns_product(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id and p.maker_id = public.my_maker_id()
  )
$$;

create or replace function public.can_view_commission(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.commission_requests c
    where c.id = p_request_id
      and (c.buyer_user_id = auth.uid() or c.maker_id = public.my_maker_id())
  )
$$;

-- ---------------------------------------------------------------------------
-- Column guards: sellers may not self-approve or edit platform-managed fields.
-- ---------------------------------------------------------------------------
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
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.completed_orders is distinct from old.completed_orders
       or new.user_id is distinct from old.user_id
       or new.slug is distinct from old.slug then
      raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists makers_guard on public.makers;
create trigger makers_guard before update on public.makers
  for each row execute function public.guard_maker_update();

create or replace function public.guard_product_write() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') or new.is_featured then
        raise exception 'New listings must be draft or pending review' using errcode = 'insufficient_privilege';
      end if;
    else
      if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
        raise exception 'Only admins can approve or reject listings' using errcode = 'insufficient_privilege';
      end if;
      if new.is_featured is distinct from old.is_featured
         or new.maker_id is distinct from old.maker_id
         or new.view_count is distinct from old.view_count
         or new.save_count is distinct from old.save_count then
        raise exception 'Field is managed by the platform' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists products_guard on public.products;
create trigger products_guard before insert or update on public.products
  for each row execute function public.guard_product_write();

-- ---------------------------------------------------------------------------
-- Grants (RLS decides which rows)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- Drop-and-recreate keeps this file re-runnable.
do $$
declare
  p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

-- users
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_admin());
create policy users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

-- makers
create policy makers_select on public.makers for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy makers_update_own on public.makers for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy makers_admin_insert on public.makers for insert with check (public.is_admin());

-- maker_follows
create policy follows_select on public.maker_follows for select
  using (user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy follows_insert on public.maker_follows for insert with check (user_id = auth.uid());
create policy follows_delete on public.maker_follows for delete using (user_id = auth.uid());

-- products & children
create policy products_select on public.products for select
  using (public.product_is_public(id) or maker_id = public.my_maker_id() or public.is_admin());
create policy products_insert on public.products for insert
  with check (maker_id = public.my_maker_id() or public.is_admin());
create policy products_update on public.products for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());
create policy products_delete on public.products for delete
  using ((maker_id = public.my_maker_id() and status = 'draft') or public.is_admin());

create policy product_images_select on public.product_images for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_images_write on public.product_images for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

create policy product_variants_select on public.product_variants for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_variants_write on public.product_variants for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

create policy product_measurements_select on public.product_measurements for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy product_measurements_write on public.product_measurements for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());

-- editorial
create policy collections_select on public.collections for select using (is_active or public.is_admin());
create policy collections_admin on public.collections for all
  using (public.is_admin()) with check (public.is_admin());
create policy collection_products_select on public.collection_products for select using (true);
create policy collection_products_admin on public.collection_products for all
  using (public.is_admin()) with check (public.is_admin());
create policy placements_select on public.editorial_placements for select using (is_active or public.is_admin());
create policy placements_admin on public.editorial_placements for all
  using (public.is_admin()) with check (public.is_admin());

-- carts (guest carts are handled server-side by an unguessable session cookie)
create policy carts_own on public.carts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_own on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- orders
create policy orders_select on public.orders for select
  using (buyer_user_id = auth.uid() or public.is_order_maker(id) or public.is_admin());

create policy fulfilments_select on public.fulfilments for select
  using (maker_id = public.my_maker_id() or public.is_order_buyer(order_id) or public.is_admin());
create policy fulfilments_update on public.fulfilments for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

create policy order_items_select on public.order_items for select
  using (maker_id = public.my_maker_id() or public.is_order_buyer(order_id) or public.is_admin());
create policy order_items_update on public.order_items for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

create policy refunds_select on public.refunds for select
  using (public.is_order_buyer(order_id) or public.is_order_maker(order_id) or public.is_admin());
create policy disputes_admin on public.disputes for select using (public.is_admin());

-- reviews: public read; insert only by the buyer (trigger enforces delivered status)
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (buyer_user_id = auth.uid());

-- buyer data
create policy saved_items_own on public.saved_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy buyer_measurements_own on public.buyer_measurements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- commissions
create policy commission_requests_select on public.commission_requests for select
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy commission_requests_insert on public.commission_requests for insert
  with check (buyer_user_id = auth.uid());
create policy commission_requests_update on public.commission_requests for update
  using (maker_id = public.my_maker_id() or buyer_user_id = auth.uid() or public.is_admin())
  with check (maker_id = public.my_maker_id() or buyer_user_id = auth.uid() or public.is_admin());

create policy commission_quotes_select on public.commission_quotes for select
  using (public.can_view_commission(commission_request_id) or public.is_admin());
create policy commission_quotes_insert on public.commission_quotes for insert
  with check (maker_id = public.my_maker_id() and public.can_view_commission(commission_request_id));
create policy commission_quotes_update on public.commission_quotes for update
  using (public.can_view_commission(commission_request_id) or public.is_admin());

-- messaging
create policy threads_select on public.message_threads for select
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id() or public.is_admin());
create policy threads_insert on public.message_threads for insert
  with check (buyer_user_id = auth.uid());
create policy threads_update on public.message_threads for update
  using (buyer_user_id = auth.uid() or maker_id = public.my_maker_id());

create policy messages_select on public.messages for select
  using (public.is_thread_participant(thread_id) or public.is_admin());
create policy messages_insert on public.messages for insert
  with check (sender_user_id = auth.uid() and public.is_thread_participant(thread_id));

create policy reply_templates_own on public.reply_templates for all
  using (maker_id = public.my_maker_id()) with check (maker_id = public.my_maker_id());

-- analytics
create policy product_views_select on public.product_views for select
  using (maker_id = public.my_maker_id() or public.is_admin());

-- operations tables: admin read only; writes happen via the service connection
create policy audit_admin on public.audit_events for select using (public.is_admin());
create policy stripe_events_admin on public.stripe_events for select using (public.is_admin());
create policy email_outbox_admin on public.email_outbox for select using (public.is_admin());
-- rate_limits: no policies => no access for anon/authenticated
