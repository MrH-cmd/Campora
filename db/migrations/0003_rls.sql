-- Row Level Security. The app connects once and drops to role campora_app for every
-- user-scoped transaction, with app.user_id set for that transaction only.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'campora_app') then
    create role campora_app nologin;
  end if;
end $$;
grant campora_app to current_user;
grant usage on schema public to campora_app;
grant select on all tables in schema public to campora_app;

-- secrets stay out of reach even for a matching row
revoke select on users from campora_app;
grant select (id, email, full_name, phone, avatar_path, university_id, role, status, status_reason,
              email_verified_at, student_status, is_sample, created_at, last_seen_at) on users to campora_app;
grant update (full_name, phone, avatar_path, university_id, last_seen_at) on users to campora_app;
revoke select on sessions, auth_tokens, rate_limits, email_outbox, webhook_events, file_blobs from campora_app;
grant select (path, is_private, owner_id, content_type) on file_blobs to campora_app;

revoke select on seller_profiles from campora_app;
grant select on seller_profiles to campora_app;
grant insert (user_id, business_name, business_type, pitch, bank_name, account_number, account_name) on seller_profiles to campora_app;
grant update (bank_name, account_number, account_name, business_name, business_type, pitch) on seller_profiles to campora_app;

grant insert (user_id, university_id, method, student_email, matric_number, document_path) on student_verifications to campora_app;
grant insert (owner_id, university_id, slug, name, tagline, description, contact_phone, contact_whatsapp, contact_email, campus_location) on storefronts to campora_app;
grant update (name, tagline, description, logo_path, cover_path, contact_phone, contact_whatsapp, contact_email, campus_location, accent, layout, announcement) on storefronts to campora_app;

grant insert (storefront_id, category_id, kind, slug, title, description, price_kobo, sale_price_kobo, status) on listings to campora_app;
grant update (category_id, title, description, price_kobo, sale_price_kobo, status) on listings to campora_app;
grant delete on listings to campora_app;
grant insert, update on products, services to campora_app;
grant insert, update, delete on listing_images to campora_app;
grant insert, update, delete on cart_items to campora_app;
grant insert, delete on favourites to campora_app;
grant insert on conversations, messages, reports to campora_app;
grant update (last_message_at) on conversations to campora_app;
grant update (read_at) on messages, notifications to campora_app;
grant insert, update, delete on discount_codes to campora_app;
grant insert, update on promotional_campaigns to campora_app;
grant insert on seller_payouts to campora_app;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy users_self on users for select to campora_app using (
  id = app_uid() or app_is_admin()
  or exists(select 1 from orders o join storefronts s on s.id = o.storefront_id where o.buyer_id = users.id and s.owner_id = app_uid())
  or exists(select 1 from conversations c join storefronts s on s.id = c.storefront_id where c.buyer_id = users.id and s.owner_id = app_uid())
  or exists(select 1 from storefronts s where s.owner_id = users.id and s.status = 'active'));
create policy users_update on users for update to campora_app using (id = app_uid()) with check (id = app_uid());

create policy read_public on universities for select to campora_app using (true);
create policy read_public on categories for select to campora_app using (true);
create policy read_public on subscription_plans for select to campora_app using (true);
create policy read_public on boost_packages for select to campora_app using (true);
create policy read_public on platform_settings for select to campora_app using (true);

create policy sv_read on student_verifications for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy sv_insert on student_verifications for insert to campora_app with check (user_id = app_uid());

create policy sp_read on seller_profiles for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy sp_insert on seller_profiles for insert to campora_app with check (user_id = app_uid());
create policy sp_update on seller_profiles for update to campora_app using (user_id = app_uid()) with check (user_id = app_uid());

create policy store_read on storefronts for select to campora_app using (status = 'active' or owner_id = app_uid() or app_is_admin());
create policy store_insert on storefronts for insert to campora_app with check (owner_id = app_uid());
create policy store_update on storefronts for update to campora_app using (owner_id = app_uid()) with check (owner_id = app_uid());

create policy listing_read on listings for select to campora_app using (
  (status = 'active' and app_store_public(storefront_id)) or app_owns_store(storefront_id) or app_is_admin()
  or exists(select 1 from order_items i join orders o on o.id = i.order_id where i.listing_id = listings.id and o.buyer_id = app_uid()));
create policy listing_insert on listings for insert to campora_app with check (app_owns_store(storefront_id));
create policy listing_update on listings for update to campora_app using (app_owns_store(storefront_id)) with check (app_owns_store(storefront_id));
create policy listing_delete on listings for delete to campora_app using (app_owns_store(storefront_id));

create policy product_read on products for select to campora_app using (exists(select 1 from listings l where l.id = listing_id));
create policy product_write on products for all to campora_app
  using (app_owns_store((select storefront_id from listings l where l.id = listing_id)))
  with check (app_owns_store((select storefront_id from listings l where l.id = listing_id)));
create policy service_read on services for select to campora_app using (exists(select 1 from listings l where l.id = listing_id));
create policy service_write on services for all to campora_app
  using (app_owns_store((select storefront_id from listings l where l.id = listing_id)))
  with check (app_owns_store((select storefront_id from listings l where l.id = listing_id)));
create policy image_read on listing_images for select to campora_app using (exists(select 1 from listings l where l.id = listing_id));
create policy image_write on listing_images for all to campora_app
  using (app_owns_store((select storefront_id from listings l where l.id = listing_id)))
  with check (app_owns_store((select storefront_id from listings l where l.id = listing_id)));

create policy stats_read on listing_daily_stats for select to campora_app using (
  app_is_admin() or app_owns_store((select storefront_id from listings l where l.id = listing_id)));

create policy sub_read on subscriptions for select to campora_app using (seller_id = app_uid() or app_is_admin());
create policy txn_read on transactions for select to campora_app using (user_id = app_uid() or app_is_admin());

create policy dc_read on discount_codes for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());
create policy dc_write on discount_codes for all to campora_app using (app_owns_store(storefront_id)) with check (app_owns_store(storefront_id));

create policy order_read on orders for select to campora_app using (buyer_id = app_uid() or app_owns_store(storefront_id) or app_is_admin());
create policy oi_read on order_items for select to campora_app using (exists(select 1 from orders o where o.id = order_id));
create policy oe_read on order_events for select to campora_app using (exists(select 1 from orders o where o.id = order_id));

create policy cart_own on cart_items for all to campora_app using (user_id = app_uid()) with check (user_id = app_uid());
create policy fav_own on favourites for all to campora_app using (user_id = app_uid()) with check (user_id = app_uid());

create policy review_read on reviews for select to campora_app using (not is_hidden or author_id = app_uid() or app_is_admin());

create policy conv_read on conversations for select to campora_app using (buyer_id = app_uid() or app_owns_store(storefront_id) or app_is_admin());
create policy conv_insert on conversations for insert to campora_app with check (buyer_id = app_uid());
create policy conv_update on conversations for update to campora_app using (buyer_id = app_uid() or app_owns_store(storefront_id));
create policy msg_read on messages for select to campora_app using (exists(select 1 from conversations c where c.id = conversation_id));
create policy msg_insert on messages for insert to campora_app with check (
  sender_id = app_uid() and exists(select 1 from conversations c where c.id = conversation_id and (c.buyer_id = app_uid() or app_owns_store(c.storefront_id))));
create policy msg_update on messages for update to campora_app using (
  exists(select 1 from conversations c where c.id = conversation_id and (c.buyer_id = app_uid() or app_owns_store(c.storefront_id))));

create policy notif_read on notifications for select to campora_app using (user_id = app_uid());
create policy notif_update on notifications for update to campora_app using (user_id = app_uid());

create policy comm_read on commissions for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());
create policy payout_read on seller_payouts for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());
create policy payout_insert on seller_payouts for insert to campora_app with check (app_owns_store(storefront_id));
create policy refund_read on refunds for select to campora_app using (app_is_admin() or exists(select 1 from orders o where o.id = order_id));

create policy boost_read on store_boosts for select to campora_app using (
  status = 'active' or app_owns_store(storefront_id) or app_is_admin());
create policy credit_read on boost_credit_ledger for select to campora_app using (seller_id = app_uid() or app_is_admin());

create policy camp_read on promotional_campaigns for select to campora_app using (
  (is_active and now() between starts_at and ends_at) or app_owns_store(storefront_id) or app_is_admin());
create policy camp_write on promotional_campaigns for insert to campora_app with check (app_owns_store(storefront_id));
create policy camp_update on promotional_campaigns for update to campora_app using (app_owns_store(storefront_id));

create policy report_read on reports for select to campora_app using (reporter_id = app_uid() or app_is_admin());
create policy report_insert on reports for insert to campora_app with check (reporter_id = app_uid());
create policy dispute_read on disputes for select to campora_app using (
  opened_by = app_uid() or app_is_admin() or exists(select 1 from orders o where o.id = order_id));
create policy log_read on admin_activity_logs for select to campora_app using (app_is_admin());
create policy blob_read on file_blobs for select to campora_app using (not is_private or owner_id = app_uid() or app_is_admin());
