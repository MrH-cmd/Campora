-- Storefront builder: templates, per-store designs (draft and published), media, effects and store analytics.

create table storefront_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  category text not null,
  industry_tags text[] not null default '{}',
  style_tags text[] not null default '{}',
  archetype text not null check (archetype in ('catalogue','magazine','streetwear','luxury','menu','portfolio','hud','beauty','spec','scrapbook')),
  config jsonb not null,
  min_plan_code text not null default 'k-leg',
  preview_path text,
  mobile_preview_path text,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table animation_assets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  category text not null check (category in ('Anime','Gaming','Cyberpunk','Luxury','Futuristic','Minimalist','Nature','Abstract','Streetwear','Technology','Cinematic','Professional')),
  renderer text not null check (renderer in ('css','canvas','three','lottie')),
  min_plan_code text not null default 'k-leg',
  params_schema jsonb not null default '{}',
  asset_path text,           -- Lottie JSON for admin-made lottie effects
  preview_path text,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- The public page renders "published"; the editor works on "draft". "backup" keeps the design a seller
-- had before they replaced items their plan stopped covering, so an upgrade can bring it back.
create table storefront_designs (
  storefront_id uuid primary key references storefronts(id) on delete cascade,
  template_id uuid references storefront_templates(id) on delete set null,
  draft jsonb,
  published jsonb,
  backup jsonb,
  published_at timestamptz,
  version int not null default 0,
  downgrade_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table storefront_media (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id) on delete cascade,
  kind text not null check (kind in ('image','gif','video','lottie')),
  path text not null,
  poster_path text,
  mime text not null,
  bytes int not null default 0,
  width int,
  height int,
  duration_ms int,
  rights_confirmed boolean not null default false,
  status text not null default 'active' check (status in ('pending','active','removed')),
  removed_reason text,
  created_at timestamptz not null default now()
);
create index on storefront_media (storefront_id, status);

create table storefront_daily_stats (
  storefront_id uuid not null references storefronts(id) on delete cascade,
  day date not null default current_date,
  visits int not null default 0,
  unique_visitors int not null default 0,
  product_clicks int not null default 0,
  primary key (storefront_id, day)
);

-- Unique visitors: a salted hash that changes every day. No IP address is stored.
create table storefront_visitor_days (
  storefront_id uuid not null references storefronts(id) on delete cascade,
  day date not null default current_date,
  visitor_hash text not null,
  hits int not null default 1,
  primary key (storefront_id, day, visitor_hash)
);
-- Logged-in visits, kept so "sales through the storefront" can be worked out honestly.
create table storefront_member_visits (
  storefront_id uuid not null references storefronts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  day date not null default current_date,
  primary key (storefront_id, user_id, day)
);

alter table storefronts add column social_links jsonb not null default '{}';
alter table storefronts add column policies text;
alter table storefronts add column is_featured boolean not null default false;
alter table storefronts add column status_reason text;

alter table storefront_templates enable row level security;
alter table animation_assets enable row level security;
alter table storefront_designs enable row level security;
alter table storefront_media enable row level security;
alter table storefront_daily_stats enable row level security;
alter table storefront_visitor_days enable row level security;
alter table storefront_member_visits enable row level security;

grant select on storefront_templates, animation_assets, storefront_designs, storefront_media, storefront_daily_stats to campora_app;
-- Sellers may only write their own draft. Publishing goes through the server, which checks the plan first.
grant insert (storefront_id, draft) on storefront_designs to campora_app;
grant update (draft, updated_at) on storefront_designs to campora_app;
grant update (social_links, policies) on storefronts to campora_app;

create policy read_active on storefront_templates for select to campora_app using (is_active or app_is_admin());
create policy read_active on animation_assets for select to campora_app using (is_active or app_is_admin());
create policy design_read on storefront_designs for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());
create policy design_insert on storefront_designs for insert to campora_app with check (app_owns_store(storefront_id));
create policy design_update on storefront_designs for update to campora_app using (app_owns_store(storefront_id)) with check (app_owns_store(storefront_id));
create policy media_read on storefront_media for select to campora_app using (
  (status = 'active' and app_store_public(storefront_id)) or app_owns_store(storefront_id) or app_is_admin());
create policy stats_read on storefront_daily_stats for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());

-- Buyers read the published design through this function, so drafts never leave the owner's hands.
create or replace function published_design(p_storefront uuid)
returns table (template_id uuid, published jsonb, published_at timestamptz, version int)
language sql stable security definer set search_path = public as $$
  select d.template_id, d.published, d.published_at, d.version
  from storefront_designs d join storefronts s on s.id = d.storefront_id
  where d.storefront_id = p_storefront and (s.status = 'active' or s.owner_id = app_uid() or app_is_admin())
$$;
revoke execute on function published_design(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke execute on function published_design(uuid) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke execute on function published_design(uuid) from authenticated; end if;
end $$;
grant execute on function published_design(uuid) to campora_app;
