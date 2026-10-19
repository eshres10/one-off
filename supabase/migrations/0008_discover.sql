-- Discover, quick view and the mega menu.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated
-- (0002 also drops every public policy on each run).

-- ---------------------------------------------------------------------------
-- Makers chosen for the "Featured" column of the Makers menu.
-- ---------------------------------------------------------------------------
alter table public.makers add column if not exists is_featured boolean not null default false;
