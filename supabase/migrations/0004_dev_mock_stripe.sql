-- Storage for the local mock payments driver (PAYMENTS_DRIVER=mock). Holds simulated Stripe
-- objects (checkout sessions, transfers, refunds, accounts) so the webhook path can re-fetch
-- them exactly as it re-fetches real objects from the Stripe API. Unused with real Stripe.
create table if not exists public.mock_stripe_objects (
  id text primary key,
  type text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.mock_stripe_objects enable row level security;
revoke all on public.mock_stripe_objects from anon, authenticated;
