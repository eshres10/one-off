-- "Message us" on Help & FAQ: a contact form anyone can send, signed in or not. Each request is
-- stored here and emailed to the support address. Re-runnable: every statement is guarded.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  topic text not null check (topic in ('order', 'returns', 'payments', 'selling', 'other')),
  order_number text check (order_number is null or char_length(order_number) <= 40),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists support_requests_new_idx on public.support_requests (created_at desc) where status = 'new';
-- Written and read by the server only.
alter table public.support_requests enable row level security;
