-- Paste into the Supabase SQL editor (the MCP connection stalls on policies and grants).
-- Run after the 0019 DDL has been applied.

drop policy if exists maker_custom_settings_own on public.maker_custom_settings;

create policy maker_custom_settings_own on public.maker_custom_settings for all
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

grant select, insert, update, delete on public.maker_custom_settings to authenticated;

grant all on public.maker_custom_settings to service_role;

drop policy if exists postcodes_read on public.postcodes;

create policy postcodes_read on public.postcodes for select using (true);

grant select on public.postcodes to anon, authenticated;

grant all on public.postcodes to service_role;

grant usage, select on sequence public.custom_request_number_seq to authenticated, service_role;

drop policy if exists custom_requests_own on public.custom_requests;

create policy custom_requests_own on public.custom_requests for all
  using (buyer_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.custom_requests to authenticated;

grant all on public.custom_requests to service_role;

drop policy if exists custom_request_recipients_read on public.custom_request_recipients;

create policy custom_request_recipients_read on public.custom_request_recipients for select
  using (
    maker_id = public.my_maker_id()
    or exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists custom_request_recipients_maker_update on public.custom_request_recipients;

create policy custom_request_recipients_maker_update on public.custom_request_recipients for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

drop policy if exists custom_request_recipients_buyer_insert on public.custom_request_recipients;

create policy custom_request_recipients_buyer_insert on public.custom_request_recipients for insert
  with check (
    exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );

grant select, insert, update on public.custom_request_recipients to authenticated;

grant all on public.custom_request_recipients to service_role;

drop policy if exists custom_quotes_read on public.custom_quotes;

create policy custom_quotes_read on public.custom_quotes for select
  using (
    maker_id = public.my_maker_id()
    or exists (select 1 from public.custom_requests r where r.id = request_id and r.buyer_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists custom_quotes_maker_write on public.custom_quotes;

create policy custom_quotes_maker_write on public.custom_quotes for insert
  with check (
    (maker_id = public.my_maker_id() and exists (
      select 1 from public.custom_request_recipients x
      where x.request_id = custom_quotes.request_id and x.maker_id = custom_quotes.maker_id))
    or public.is_admin()
  );

drop policy if exists custom_quotes_maker_update on public.custom_quotes;

create policy custom_quotes_maker_update on public.custom_quotes for update
  using (maker_id = public.my_maker_id() or public.is_admin())
  with check (maker_id = public.my_maker_id() or public.is_admin());

grant select, insert, update on public.custom_quotes to authenticated;

grant all on public.custom_quotes to service_role;

grant select on public.order_summaries to authenticated;

drop policy if exists help_requests_own on public.help_requests;

create policy help_requests_own on public.help_requests for select
  using (buyer_id = auth.uid() or public.is_admin());

drop policy if exists help_requests_insert on public.help_requests;

create policy help_requests_insert on public.help_requests for insert
  with check (buyer_id = auth.uid() or public.is_admin());

drop policy if exists help_requests_admin on public.help_requests;

create policy help_requests_admin on public.help_requests for update
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.help_requests to authenticated;

grant all on public.help_requests to service_role;

revoke all on public.maker_request_view from anon;

grant select on public.maker_request_view to authenticated, service_role;
