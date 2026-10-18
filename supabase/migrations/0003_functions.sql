-- Server-side helper functions.

create sequence if not exists public.order_number_seq start 10001;

create or replace function public.next_order_number() returns text
language sql volatile security definer set search_path = public as $$
  select 'OO-' || nextval('public.order_number_seq')::text
$$;

-- Fixed-window rate limiter. Returns true when the call is allowed.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return c <= p_max;
end
$$;

-- Atomically decrement stock; returns false (and changes nothing) if insufficient.
create or replace function public.decrement_stock(p_variant_id uuid, p_qty integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  updated integer;
begin
  -- Made-to-order stock is a production-capacity cap rather than inventory; the same
  -- atomic decrement applies so makers can limit open orders.
  update public.product_variants
     set stock_quantity = stock_quantity - p_qty
   where id = p_variant_id and stock_quantity >= p_qty;
  get diagnostics updated = row_count;
  return updated = 1;
end
$$;

revoke execute on function public.decrement_stock(uuid, integer) from anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from anon, authenticated;
revoke execute on function public.next_order_number() from anon, authenticated;
