-- Listings publish straight away. Admins can still remove them, and can turn review back on in settings.
insert into platform_settings(key, value) values ('require_listing_review', 'false')
  on conflict (key) do update set value = 'false', updated_at = now();
update listings set status = 'active' where status = 'pending_review';
