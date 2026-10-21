-- Policies and grants missing from production as of 21 Oct 2026, applied through the Supabase MCP.
-- The MCP stalls on bare create policy / grant statements but runs them inside a DO block,
-- so every statement here is wrapped; re-running is safe (duplicates are skipped).

do $outer$ begin
  begin
    create policy custom_quotes_maker_update on public.custom_quotes for update to public using (((maker_id = my_maker_id()) OR is_admin())) with check (((maker_id = my_maker_id()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_quotes_maker_write on public.custom_quotes for insert to public with check ((((maker_id = my_maker_id()) AND (EXISTS ( SELECT 1
       FROM custom_request_recipients x
      WHERE ((x.request_id = custom_quotes.request_id) AND (x.maker_id = custom_quotes.maker_id))))) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_quotes_read on public.custom_quotes for select to public using (((maker_id = my_maker_id()) OR (EXISTS ( SELECT 1
       FROM custom_requests r
      WHERE ((r.id = custom_quotes.request_id) AND (r.buyer_id = auth.uid())))) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_request_recipients_buyer_insert on public.custom_request_recipients for insert to public with check (((EXISTS ( SELECT 1
       FROM custom_requests r
      WHERE ((r.id = custom_request_recipients.request_id) AND (r.buyer_id = auth.uid())))) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_request_recipients_maker_update on public.custom_request_recipients for update to public using (((maker_id = my_maker_id()) OR is_admin())) with check (((maker_id = my_maker_id()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_request_recipients_read on public.custom_request_recipients for select to public using (((maker_id = my_maker_id()) OR (EXISTS ( SELECT 1
       FROM custom_requests r
      WHERE ((r.id = custom_request_recipients.request_id) AND (r.buyer_id = auth.uid())))) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy custom_requests_own on public.custom_requests for all to public using (((buyer_id = auth.uid()) OR is_admin())) with check (((buyer_id = auth.uid()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy help_requests_admin on public.help_requests for update to public using (is_admin()) with check (is_admin());
  exception when duplicate_object then null; end;
  begin
    create policy help_requests_insert on public.help_requests for insert to public with check (((buyer_id = auth.uid()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy help_requests_own on public.help_requests for select to public using (((buyer_id = auth.uid()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy listing_requests_read on public.listing_requests for select to public using (((maker_id = my_maker_id()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy maker_custom_settings_own on public.maker_custom_settings for all to public using (((maker_id = my_maker_id()) OR is_admin())) with check (((maker_id = my_maker_id()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy product_stories_select on public.product_stories for select to public using ((product_is_public(product_id) OR owns_product(product_id) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy product_stories_write on public.product_stories for all to public using ((owns_product(product_id) OR is_admin())) with check ((owns_product(product_id) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy push_subscriptions_own on public.push_subscriptions for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
  exception when duplicate_object then null; end;
  begin
    create policy restock_alerts_delete_own on public.restock_alerts for delete to public using ((user_id = auth.uid()));
  exception when duplicate_object then null; end;
  begin
    create policy restock_alerts_own on public.restock_alerts for select to public using (((user_id = auth.uid()) OR is_admin()));
  exception when duplicate_object then null; end;
  begin
    create policy returns_read on public.returns for select to public using (((buyer_id = auth.uid()) OR (maker_id = my_maker_id()) OR is_admin()));
  exception when duplicate_object then null; end;
  grant SELECT on public.client_events to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.client_events to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.client_events to service_role;
  grant SELECT on public.custom_quotes to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.custom_quotes to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.custom_quotes to service_role;
  grant SELECT on public.custom_request_recipients to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.custom_request_recipients to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.custom_request_recipients to service_role;
  grant SELECT on public.custom_requests to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.custom_requests to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.custom_requests to service_role;
  grant SELECT on public.help_requests to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.help_requests to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.help_requests to service_role;
  grant SELECT on public.listing_requests to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.listing_requests to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_requests to service_role;
  grant SELECT on public.maker_custom_settings to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.maker_custom_settings to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.maker_custom_settings to service_role;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mock_stripe_objects to service_role;
  grant SELECT on public.product_stories to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.product_stories to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.product_stories to service_role;
  grant SELECT on public.push_subscriptions to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.push_subscriptions to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.push_subscriptions to service_role;
  grant SELECT on public.rate_limits to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.rate_limits to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.rate_limits to service_role;
  grant SELECT on public.reservations to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.reservations to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reservations to service_role;
  grant SELECT on public.restock_alerts to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.restock_alerts to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.restock_alerts to service_role;
  grant SELECT on public.restore_tokens to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.restore_tokens to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.restore_tokens to service_role;
  grant SELECT on public.returns to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.returns to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.returns to service_role;
  grant SELECT on public.support_requests to anon;
  grant DELETE, INSERT, SELECT, UPDATE on public.support_requests to authenticated;
  grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.support_requests to service_role;
  grant usage, select on sequence public.order_number_seq to authenticated, service_role;
  grant usage, select on sequence public.case_number_seq to authenticated, service_role;
  grant usage, select on sequence public.return_number_seq to authenticated, service_role;
  grant usage, select on sequence public.custom_request_number_seq to authenticated, service_role;
end $outer$;

do $outer$ begin
  grant select on public.order_summaries to authenticated;
  revoke all on public.maker_request_view from anon;
  grant select on public.maker_request_view to authenticated, service_role;
end $outer$;
