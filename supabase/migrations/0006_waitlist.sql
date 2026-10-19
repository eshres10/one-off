-- Pre-launch waitlist: shoppers who want to hear when we open, and makers who want to sell.
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  kind text not null check (kind in ('shopper', 'maker')),
  name text,
  instagram text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_signups_created_idx on public.waitlist_signups (created_at desc);
create index if not exists waitlist_signups_kind_idx on public.waitlist_signups (kind);

-- Sign-ups are written by the server (service connection) only; admins can read them.
alter table public.waitlist_signups enable row level security;
drop policy if exists waitlist_admin on public.waitlist_signups;
create policy waitlist_admin on public.waitlist_signups for select using (public.is_admin());
