alter table seller_profiles add column if not exists dashboard_layout jsonb;
grant update (dashboard_layout) on seller_profiles to campora_app;
alter table storefronts alter column accent set default '#7C3AED';
update storefronts set accent = '#7C3AED' where accent = '#0B8F5A';
