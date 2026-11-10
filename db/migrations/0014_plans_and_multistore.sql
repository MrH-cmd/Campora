-- Plans: how many storefronts and effect layers each plan gets, plus an editable table of which
-- plan unlocks each storefront feature. Admins change these without a code change.
alter table subscription_plans
  add column if not exists storefront_limit int not null default 1 check (storefront_limit between 1 and 50),
  add column if not exists effect_layers int not null default 2 check (effect_layers between 0 and 12);
update subscription_plans set storefront_limit = 1, effect_layers = 2 where code = 'k-leg';
update subscription_plans set storefront_limit = 3, effect_layers = 4 where code = 'no-dulling';
update subscription_plans set storefront_limit = 5, effect_layers = 6 where code = 'odogwu';

create table if not exists plan_features (
  key text primary key,
  label text not null,
  description text not null default '',
  grp text not null default 'Design',
  min_plan_code text not null check (min_plan_code in ('k-leg','no-dulling','odogwu')),
  sort int not null default 0
);
alter table plan_features enable row level security;
grant select on plan_features to campora_app;
create policy plan_features_read on plan_features for select to campora_app using (true);

insert into plan_features(key, label, description, grp, min_plan_code, sort) values
  ('gif_banner',        'GIF banners',                    'Animated GIF banners. K-Leg GIFs are limited to 2 MB.', 'Banners', 'k-leg', 10),
  ('video_banner',      'Video banners',                  'Muted MP4 or WebM banners up to 20 seconds.', 'Banners', 'no-dulling', 11),
  ('parallax',          'Parallax scrolling',             'The banner moves slower than the page as buyers scroll.', 'Banners', 'no-dulling', 12),
  ('hero_style',        'Advanced hero sections',         'Pick any hero layout, not just the template''s own.', 'Layout', 'no-dulling', 20),
  ('card_style',        'More product card styles',       'Pick any product card style.', 'Layout', 'no-dulling', 21),
  ('layout_list',       'List product layout',            'Show products as a detailed list.', 'Layout', 'no-dulling', 22),
  ('layout_showcase',   'Showcase product layouts',       'Carousel and spotlight product showcases.', 'Layout', 'odogwu', 23),
  ('section_tone',      'Section backgrounds',            'Give each section its own background tone.', 'Layout', 'no-dulling', 24),
  ('section_width',     'Custom section positioning',     'Make any section full width or narrow.', 'Layout', 'odogwu', 25),
  ('nav_style',         'Navigation styles',              'Bar, pills, underline or floating navigation.', 'Navigation', 'no-dulling', 30),
  ('nav_labels',        'Custom navigation labels',       'Rename menu items, for example Products to Menu.', 'Navigation', 'odogwu', 31),
  ('type_controls',     'Font sizes and button styles',   'Scale text and choose button shapes.', 'Typography', 'no-dulling', 40),
  ('type_premium',      'Premium typography',             'Uppercase headings and letter spacing.', 'Typography', 'odogwu', 41),
  ('bg_more',           'More page backgrounds',          'Dots, grid and grain backgrounds.', 'Backgrounds', 'no-dulling', 50),
  ('bg_premium',        'Premium page backgrounds',       'Mesh and spotlight backgrounds.', 'Backgrounds', 'odogwu', 51),
  ('transition_rise',   'Section animations',             'Sections rise into view as buyers scroll.', 'Animation', 'no-dulling', 60),
  ('transition_cinema', 'Cinematic transitions',          'Sections reveal with a cinematic wipe.', 'Animation', 'odogwu', 61),
  ('effect_controls',   'More animation controls',        'Speed, direction and density for each effect.', 'Animation', 'no-dulling', 62),
  ('effect_position',   'Custom animation positioning',   'Move effects anywhere with offsets.', 'Animation', 'odogwu', 63),
  ('effect_layering',   'Advanced graphic layering',      'Put effects in front of content and across the whole page.', 'Animation', 'odogwu', 64),
  ('intensity',         'Animation intensity',            'One control that turns every effect up or down.', 'Animation', 'odogwu', 65),
  ('lottie',            'Lottie animations',              'Upload your own Lottie animations.', 'Animation', 'odogwu', 66),
  ('rive',              'Rive animations',                'Upload your own Rive animations.', 'Animation', 'odogwu', 67),
  ('analytics_engagement', 'Engagement analytics',        'Product clicks, enquiries, most viewed products and store sales.', 'Analytics', 'no-dulling', 80),
  ('analytics_insights',   'Visitor insights',            'Conversion rate, traffic sources and devices.', 'Analytics', 'odogwu', 81)
on conflict (key) do nothing;

-- One clouds scene for K-Leg, so the free plan has a taste of the anime themes.
update animation_assets set min_plan_code = 'k-leg' where slug = 'clouds' and min_plan_code = 'no-dulling';

-- Several storefronts per seller. The seller orders them; stores past their plan's limit pause.
alter table storefronts drop constraint if exists storefronts_owner_id_key;
alter table storefronts add column if not exists position int not null default 0,
  add column if not exists paused_notified_at timestamptz;
create index if not exists storefronts_owner_idx on storefronts(owner_id, position, created_at);
grant update (position) on storefronts to campora_app;

-- True while a store is inside its owner's plan allowance. Checked live, so an expired plan pauses
-- extra stores straight away and an upgrade brings them back with no job to run.
create or replace function app_store_within_plan(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when not exists (select 1 from storefronts o where o.owner_id = st.owner_id and o.id <> st.id) then true
      else (select count(*) from storefronts o where o.owner_id = st.owner_id
              and (o.position, o.created_at, o.id) < (st.position, st.created_at, st.id))
           < (select storefront_limit from effective_plan(st.owner_id))
    end
    from storefronts st where st.id = s), false) $$;
revoke execute on function app_store_within_plan(uuid) from public;
grant execute on function app_store_within_plan(uuid) to campora_app;

create or replace function app_store_public(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from storefronts where id = s and status = 'active') and app_store_within_plan(s) $$;

drop policy if exists store_read on storefronts;
create policy store_read on storefronts for select to campora_app
  using ((status = 'active' and app_store_within_plan(id)) or owner_id = app_uid() or app_is_admin());

-- New stores can only be opened inside the plan's allowance (the app checks too).
-- Runs as the caller (no security definer), so current_user tells us whether the app role is inserting.
create or replace function enforce_store_limit() returns trigger language plpgsql set search_path = public as $$
declare lim int; used int;
begin
  if current_user = 'campora_app' and not app_is_admin() then
    select storefront_limit into lim from effective_plan(new.owner_id);
    select count(*) into used from storefronts where owner_id = new.owner_id;
    if used >= lim then
      raise exception 'STORE_LIMIT: your plan allows % storefront(s)', lim using errcode = 'P0001';
    end if;
  end if;
  new.position := coalesce((select max(position) + 1 from storefronts where owner_id = new.owner_id), 0);
  return new;
end $$;
drop trigger if exists storefront_limit on storefronts;
create trigger storefront_limit before insert on storefronts for each row execute function enforce_store_limit();

-- Listing limits stay per seller account, so extra stores don't multiply a plan's listing allowance.
create or replace function enforce_listing_rules() returns trigger
language plpgsql as $$
declare
  plan subscription_plans;
  used int;
  owner uuid := (select owner_id from storefronts where id = new.storefront_id);
  review_required boolean;
  privileged boolean := current_user <> 'campora_app' or app_is_admin();
begin
  if tg_op = 'UPDATE' and old.status = 'removed' and new.status <> 'removed' and not privileged then
    raise exception 'LISTING_REMOVED: this listing was removed by moderators' using errcode = 'P0001';
  end if;
  if new.status in ('active','pending_review')
     and (tg_op = 'INSERT' or old.status not in ('active','pending_review')) then
    select * into plan from effective_plan(owner);
    select count(*) into used from listings l join storefronts s on s.id = l.storefront_id
      where s.owner_id = owner and l.status in ('active','pending_review') and l.id <> new.id;
    if used >= plan.listing_limit then
      raise exception 'LISTING_LIMIT: your % plan allows % active listings across your storefronts', plan.name, plan.listing_limit
        using errcode = 'P0001';
    end if;
  end if;
  review_required := coalesce((setting_jsonb('require_listing_review'))::boolean, true);
  if new.status = 'active' and new.approved_at is null and review_required and not privileged then
    raise exception 'REVIEW_REQUIRED: this listing needs admin approval first' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
alter function enforce_listing_rules() set search_path = public;

-- Where store visitors come from and what they use. Coarse categories only, no URLs or IP addresses.
create table if not exists storefront_daily_sources (
  storefront_id uuid not null references storefronts(id) on delete cascade,
  day date not null default current_date,
  source text not null check (source in ('direct','vybe','whatsapp','instagram','tiktok','x','facebook','google','other')),
  device text not null check (device in ('mobile','desktop')),
  visits int not null default 0,
  primary key (storefront_id, day, source, device)
);
alter table storefront_daily_sources enable row level security;
grant select on storefront_daily_sources to campora_app;
create policy sources_read on storefront_daily_sources for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());

-- Rive files are a new media kind.
alter table storefront_media drop constraint if exists storefront_media_kind_check;
alter table storefront_media add constraint storefront_media_kind_check check (kind in ('image','gif','video','lottie','rive'));

alter table animation_assets drop constraint if exists animation_assets_renderer_check;
alter table animation_assets add constraint animation_assets_renderer_check check (renderer in ('css','canvas','three','lottie','rive'));

-- Plan descriptions shown on the pricing page.
update subscription_plans set features = array_replace(features, 'One storefront', 'Three storefronts') where code = 'no-dulling';
update subscription_plans set features = array_replace(features, 'One storefront', 'Five storefronts') where code = 'odogwu';
