-- Launch clean-up: remove every sample row, then set agreed prices and Covenant University pickup points.
-- Safe on fresh databases: seed data does not exist yet when migrations run there.
delete from promotional_campaigns where storefront_id is null;
delete from file_blobs where path like 'sample/%';
delete from store_boosts where storefront_id in (select id from storefronts where is_sample);
delete from storefronts where is_sample;
delete from users where is_sample;
update subscription_plans set price_kobo = 1500000 where code = 'no-dulling';
update subscription_plans set price_kobo = 3000000 where code = 'odogwu';
update universities set pickup_points = array[
  'University Chapel car park','Centre for Learning Resources entrance','Cafeteria 1','Cafeteria 2',
  'College of Science and Technology','College of Engineering','College of Management and Social Sciences','College of Leadership Development Studies',
  'University Stadium','Daniel Hall gate','Joseph Hall gate','Paul Hall gate','Peter Hall gate','John Hall gate',
  'Esther Hall gate','Mary Hall gate','Deborah Hall gate','Lydia Hall gate','Dorcas Hall gate']
where slug = 'covenant-university';
delete from email_outbox;
