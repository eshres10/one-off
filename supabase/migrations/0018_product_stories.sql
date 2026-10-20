-- "Story of the garment": an optional story on a piece, written by the maker and shown as its
-- own section on the product page. Re-runnable: every statement is guarded.

-- Detail chips: up to 12, each 1–40 characters (a CHECK can't use a subquery, so a helper).
create or replace function public.story_details_ok(details text[]) returns boolean
language sql immutable as $$
  select coalesce(cardinality(details), 0) <= 12
    and coalesce((select bool_and(char_length(d) between 1 and 40) from unnest(details) d), true)
$$;

-- Close-ups: up to 3 of { path, caption }, captions up to 120 characters.
create or replace function public.story_closeups_ok(closeups jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(closeups) = 'array' and jsonb_array_length(closeups) <= 3
    and coalesce((
      select bool_and(
        jsonb_typeof(c) = 'object'
        and char_length(coalesce(c ->> 'path', '')) between 1 and 500
        and char_length(coalesce(c ->> 'caption', '')) <= 120)
      from jsonb_array_elements(closeups) c), true)
$$;

create table if not exists public.product_stories (
  product_id uuid primary key references public.products (id) on delete cascade,
  quote text check (quote is null or char_length(quote) <= 160),
  inspiration text check (inspiration is null or char_length(inspiration) <= 1200),
  details text[] not null default '{}' check (public.story_details_ok(details)),
  fabric text check (fabric is null or char_length(fabric) <= 240),
  hours_to_make integer check (hours_to_make is null or hours_to_make between 1 and 500),
  closeups jsonb not null default '[]' check (public.story_closeups_ok(closeups)),
  updated_at timestamptz not null default now()
);
alter table public.product_stories enable row level security;

-- Anyone can read the story of a published piece; only its maker (or One Off) can write it.
drop policy if exists product_stories_select on public.product_stories;
create policy product_stories_select on public.product_stories for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
drop policy if exists product_stories_write on public.product_stories;
create policy product_stories_write on public.product_stories for all
  using (public.owns_product(product_id) or public.is_admin())
  with check (public.owns_product(product_id) or public.is_admin());
grant select on public.product_stories to anon, authenticated;
grant insert, update, delete on public.product_stories to authenticated;
grant all on public.product_stories to service_role;

-- How many people make the pieces: "1 person / cuts, sews and finishes it" on the story.
alter table public.makers add column if not exists team_size integer
  check (team_size is null or team_size between 1 and 500);

-- The maker's own name as it signs their stories ("Ingrid Halde"); the shop name if empty.
alter table public.makers add column if not exists owner_display_name text
  check (owner_display_name is null or char_length(owner_display_name) between 1 and 80);
