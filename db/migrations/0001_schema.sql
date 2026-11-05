-- Campora core schema. All money is stored as integer kobo (bigint).
create extension if not exists pg_trgm;

create type user_role as enum ('customer','seller','admin');
create type account_status as enum ('active','restricted','suspended');
create type student_status as enum ('unverified','pending','verified','rejected');
create type review_state as enum ('pending','approved','rejected');
create type listing_kind as enum ('product','service');
create type listing_status as enum ('draft','pending_review','active','inactive','rejected','removed');
create type order_status as enum ('pending','accepted','processing','ready_for_pickup','completed','cancelled');
create type payment_method as enum ('online','pay_on_pickup');
create type payment_status as enum ('awaiting_payment','paid','pay_on_pickup','collected','refunded','failed');
create type txn_purpose as enum ('order','subscription','boost');
create type txn_status as enum ('initiated','success','failed','refunded');
create type pay_provider as enum ('paystack','flutterwave');

create table universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  slug text not null unique,
  city text,
  state text,
  country text not null default 'Nigeria',
  is_active boolean not null default true,
  -- which verification routes this university accepts
  verification_methods text[] not null default '{id_upload}',
  student_email_domains text[] not null default '{}',
  pickup_points text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint valid_methods check (verification_methods <@ array['student_email','id_upload'])
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text not null,
  phone text,
  avatar_path text,
  university_id uuid references universities(id),
  role user_role not null default 'customer',
  status account_status not null default 'active',
  status_reason text,
  email_verified_at timestamptz,
  student_status student_status not null default 'unverified',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index users_email_idx on users (lower(email));
create index users_university_idx on users (university_id);
create index users_name_trgm on users using gin (full_name gin_trgm_ops);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('email_verify','password_reset','student_email')),
  token_hash text not null unique,
  meta jsonb not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  hits int not null default 0,
  reset_at timestamptz not null
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table student_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  university_id uuid not null references universities(id),
  method text not null check (method in ('student_email','id_upload')),
  student_email text,
  matric_number text,
  document_path text,
  status review_state not null default 'pending',
  review_note text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sv_status_idx on student_verifications (status, created_at);
create index sv_user_idx on student_verifications (user_id);

create table seller_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  status review_state not null default 'pending',
  business_name text not null,
  business_type text not null,
  pitch text not null,
  bank_name text,
  account_number text check (account_number ~ '^[0-9]{10}$'),
  account_name text,
  review_note text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sp_status_idx on seller_profiles (status);

create table storefronts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references users(id) on delete cascade, -- one storefront per seller, on every plan
  university_id uuid not null references universities(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  tagline text,
  description text,
  logo_path text,
  cover_path text,
  contact_phone text,
  contact_whatsapp text,
  contact_email text,
  campus_location text,
  accent text not null default '#0B8F5A' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  layout text not null default 'grid' check (layout in ('grid','editorial')),
  announcement text,
  status text not null default 'active' check (status in ('active','hidden','suspended')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index storefronts_uni_idx on storefronts (university_id, status);
create index storefronts_name_trgm on storefronts using gin (name gin_trgm_ops);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind listing_kind not null,
  icon text not null default 'Tag',
  sort int not null default 0,
  is_active boolean not null default true
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id) on delete cascade,
  category_id uuid not null references categories(id),
  kind listing_kind not null,
  slug text not null unique,
  title text not null check (length(title) between 3 and 120),
  description text not null,
  price_kobo bigint not null check (price_kobo >= 0),
  sale_price_kobo bigint check (sale_price_kobo >= 0),
  status listing_status not null default 'draft',
  approved_at timestamptz,
  moderation_note text,
  sold_count int not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', description), 'B')
  ) stored,
  constraint sale_below_price check (sale_price_kobo is null or sale_price_kobo < price_kobo)
);
create index listings_store_idx on listings (storefront_id, status);
create index listings_browse_idx on listings (status, kind, created_at desc);
create index listings_category_idx on listings (category_id, status);
create index listings_price_idx on listings (price_kobo);
create index listings_search_idx on listings using gin (search);
create index listings_title_trgm on listings using gin (title gin_trgm_ops);

create table products (
  listing_id uuid primary key references listings(id) on delete cascade,
  stock int not null default 0 check (stock >= 0),
  item_condition text not null default 'new' check (item_condition in ('new','like_new','used','handmade'))
);

create table services (
  listing_id uuid primary key references listings(id) on delete cascade,
  price_type text not null default 'fixed' check (price_type in ('fixed','starting_from')),
  availability text,
  is_available boolean not null default true,
  turnaround text
);

-- Spec name "product images": holds photos for products and portfolio images for services.
create table listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  path text not null,
  alt text,
  position int not null default 0
);
create index listing_images_idx on listing_images (listing_id, position);

create table listing_daily_stats (
  listing_id uuid not null references listings(id) on delete cascade,
  day date not null default current_date,
  views int not null default 0,
  enquiries int not null default 0,
  primary key (listing_id, day)
);

create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tagline text not null,
  price_kobo bigint check (price_kobo >= 0), -- null = not yet priced; cannot be purchased
  listing_limit int not null check (listing_limit > 0),
  photo_limit int not null check (photo_limit > 0),
  customization_level int not null default 0,  -- 0 basic, 1 advanced, 2 full
  analytics_level int not null default 0,      -- 0 basic, 1 detailed, 2 advanced
  coupons_enabled boolean not null default false,
  campaigns_enabled boolean not null default false,
  monthly_boost_credits int not null default 0,
  features text[] not null default '{}',
  sort int not null default 0
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references users(id),
  purpose txn_purpose not null,
  provider pay_provider not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  status txn_status not null default 'initiated',
  provider_reference text,
  meta jsonb not null default '{}',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index transactions_user_idx on transactions (user_id, created_at desc);
create index transactions_status_idx on transactions (status, created_at desc);

create table webhook_events (
  provider pay_provider not null,
  event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  status text not null default 'active' check (status in ('active','expired','replaced')),
  started_at timestamptz not null default now(),
  expires_at timestamptz, -- null for free plan
  next_plan_id uuid references subscription_plans(id), -- scheduled downgrade
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now()
);
create unique index one_active_subscription on subscriptions (seller_id) where status = 'active';

create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  percent_off int not null check (percent_off between 1 and 90),
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (storefront_id, code)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  buyer_id uuid not null references users(id),
  storefront_id uuid not null references storefronts(id),
  status order_status not null default 'pending',
  payment_method payment_method not null,
  payment_status payment_status not null,
  subtotal_kobo bigint not null,
  discount_kobo bigint not null default 0,
  total_kobo bigint not null check (total_kobo >= 0),
  pickup_point text,
  buyer_note text,
  pickup_code text not null,
  transaction_id uuid references transactions(id),
  discount_code_id uuid references discount_codes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_idx on orders (buyer_id, created_at desc);
create index orders_store_idx on orders (storefront_id, status, created_at desc);
create index orders_txn_idx on orders (transaction_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  listing_id uuid not null references listings(id),
  title text not null,
  unit_price_kobo bigint not null,
  quantity int not null check (quantity > 0)
);
create index order_items_order_idx on order_items (order_id);
create index order_items_listing_idx on order_items (listing_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  actor_id uuid references users(id),
  note text,
  created_at timestamptz not null default now()
);
create index order_events_idx on order_events (order_id, created_at);

create table cart_items (
  user_id uuid not null references users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  quantity int not null default 1 check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  storefront_id uuid references storefronts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_target check ((listing_id is null) <> (storefront_id is null))
);
create unique index fav_listing_idx on favourites (user_id, listing_id) where listing_id is not null;
create unique index fav_store_idx on favourites (user_id, storefront_id) where storefront_id is not null;

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references order_items(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  storefront_id uuid not null references storefronts(id) on delete cascade,
  author_id uuid not null references users(id),
  rating int not null check (rating between 1 and 5),
  body text,
  is_hidden boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_listing_idx on reviews (listing_id) where not is_hidden;
create index reviews_store_idx on reviews (storefront_id) where not is_hidden;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references users(id) on delete cascade,
  storefront_id uuid not null references storefronts(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (buyer_id, storefront_id)
);
create index conversations_store_idx on conversations (storefront_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null check (length(body) between 1 and 2000),
  listing_id uuid references listings(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conv_idx on messages (conversation_id, created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  storefront_id uuid not null references storefronts(id),
  rate_bps int not null,
  gross_kobo bigint not null,
  commission_kobo bigint not null,
  net_kobo bigint not null,
  status text not null default 'earned' check (status in ('earned','reversed')),
  created_at timestamptz not null default now()
);
create index commissions_store_idx on commissions (storefront_id, created_at desc);

create table seller_payouts (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'requested' check (status in ('requested','paid','rejected')),
  bank_snapshot jsonb not null default '{}',
  bank_reference text,
  note text,
  processed_by uuid references users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payouts_store_idx on seller_payouts (storefront_id, created_at desc);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  transaction_id uuid references transactions(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null,
  status text not null default 'requested' check (status in ('requested','processed','rejected')),
  provider_reference text,
  note text,
  processed_by uuid references users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_open_refund on refunds (order_id) where status <> 'rejected';

create table boost_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  placement text not null check (placement in ('homepage_featured','search_priority','storefront_promoted')),
  duration_days int not null check (duration_days > 0),
  price_kobo bigint check (price_kobo >= 0), -- null = credits only until admin sets a price
  credit_cost int not null default 1 check (credit_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table store_boosts (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  package_id uuid not null references boost_packages(id),
  placement text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment','active','ended','cancelled')),
  paid_with text not null check (paid_with in ('credits','payment')),
  transaction_id uuid references transactions(id),
  starts_at timestamptz,
  ends_at timestamptz,
  impressions int not null default 0,
  created_at timestamptz not null default now()
);
create index boosts_live_idx on store_boosts (placement, status, ends_at);

create table boost_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users(id) on delete cascade,
  delta int not null,
  reason text not null,
  period text, -- yyyy-mm for monthly grants; unique so a grant cannot run twice
  created_at timestamptz not null default now()
);
create unique index credit_grant_once on boost_credit_ledger (seller_id, period) where period is not null;

create table promotional_campaigns (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid references storefronts(id) on delete cascade, -- null = platform-run placement
  university_id uuid references universities(id),
  title text not null,
  body text,
  href text,
  percent_off int check (percent_off between 1 and 90), -- storefront-wide discount
  is_sponsored boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index campaigns_live_idx on promotional_campaigns (is_active, starts_at, ends_at);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id),
  target_type text not null check (target_type in ('listing','storefront','user','review')),
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution text,
  handled_by uuid references users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on reports (status, created_at);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  opened_by uuid not null references users(id),
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved_buyer','resolved_seller','closed')),
  resolution text,
  handled_by uuid references users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_open_dispute on disputes (order_id) where status = 'open';

create table admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users(id),
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_logs_idx on admin_activity_logs (created_at desc);

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table file_blobs ( -- development/local upload store; production uses Supabase Storage
  path text primary key,
  content_type text not null,
  data bytea not null,
  is_private boolean not null default false,
  owner_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
