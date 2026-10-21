-- The phone app: six making steps on made-to-order orders (Order in → Fabric bought → Cutting →
-- Sewing → Finishing → Shipped), and a once-only "expires in 6 hours" push on custom requests.
-- Re-runnable: every statement is guarded.

-- mto_step was 0 Ordered, 1 Cutting, 2 Sewing, 3 Ready. It is now 0 Order in, 1 Fabric bought,
-- 2 Cutting, 3 Sewing, 4 Finishing (ready). Existing rows move up one from Cutting onwards.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'fulfilments_mto_step_check'
      and pg_get_constraintdef(oid) like '%<= 3%'
  ) then
    alter table public.fulfilments drop constraint fulfilments_mto_step_check;
    update public.fulfilments set mto_step = mto_step + 1 where mto_step >= 1;
    alter table public.fulfilments add constraint fulfilments_mto_step_check check (mto_step between 0 and 4);
  end if;
end $$;

alter table public.custom_request_recipients add column if not exists expiring_pushed_at timestamptz;
