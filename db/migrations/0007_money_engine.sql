-- Discounts, referrals, reward wallet, ledger, deletion, verification reviews, pickup and service tracking.
alter table users
  add column if not exists referral_code text unique,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table categories add column if not exists commission_bps int check (commission_bps between 0 and 5000);

alter table orders
  add column if not exists campaign_discount_kobo bigint not null default 0,
  add column if not exists wallet_credit_kobo bigint not null default 0,
  add column if not exists seller_funded_kobo bigint not null default 0,
  add column if not exists platform_funded_kobo bigint not null default 0,
  add column if not exists pickup_date date,
  add column if not exists pickup_window text,
  add column if not exists pickup_instructions text,
  add column if not exists service_stage text,
  add column if not exists service_expected_at timestamptz,
  add column if not exists appointment text;
alter table order_items
  add column if not exists category_id uuid references categories(id),
  add column if not exists kind listing_kind not null default 'product',
  add column if not exists commission_bps int,
  add column if not exists commission_kobo bigint;

alter table commissions drop constraint if exists commissions_status_check;
alter table commissions add constraint commissions_status_check check (status in ('earned','owed','reversed'));
alter table commissions add column if not exists eligible_kobo bigint;
update commissions set eligible_kobo = gross_kobo where eligible_kobo is null;

alter table seller_profiles add column if not exists bank_code text, add column if not exists paystack_recipient_code text, add column if not exists account_verified_at timestamptz;
alter table seller_payouts drop constraint if exists seller_payouts_status_check;
alter table seller_payouts add constraint seller_payouts_status_check check (status in ('requested','processing','paid','failed','rejected'));
alter table seller_payouts add column if not exists transfer_reference text unique, add column if not exists transfer_code text;

alter table student_verifications
  add column if not exists full_name text,
  add column if not exists department text,
  add column if not exists academic_level text,
  add column if not exists internal_note text;
alter table student_verifications drop constraint if exists student_verifications_status_check;
create table verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references student_verifications(id) on delete cascade,
  admin_id uuid references users(id),
  decision text not null check (decision in ('approved','rejected','needs_info','note')),
  reason text,
  created_at timestamptz not null default now()
);
create index on verification_reviews (verification_id, created_at);

create table discount_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  code text,
  is_automatic boolean not null default false,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value bigint not null check (discount_value > 0), -- percent, or kobo for fixed
  maximum_discount_kobo bigint check (maximum_discount_kobo > 0),
  minimum_order_kobo bigint not null default 0,
  user_scope text not null default 'all' check (user_scope in ('all','new_users','first_time','selected')),
  new_user_days int not null default 30,
  selected_user_emails text[] not null default '{}',
  target_listing_ids uuid[] not null default '{}',
  target_category_ids uuid[] not null default '{}',
  target_storefront_ids uuid[] not null default '{}',
  funding_source text not null default 'platform' check (funding_source in ('platform','seller','shared')),
  seller_share_percent int not null default 0 check (seller_share_percent between 0 and 100),
  seller_agreement_ref text,
  stackable boolean not null default false,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  usage_limit int check (usage_limit > 0),
  per_user_limit int not null default 1 check (per_user_limit > 0),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percentage' or discount_value between 1 and 100),
  check (is_automatic or code is not null),
  check (funding_source = 'platform' or (cardinality(target_storefront_ids) > 0 and seller_agreement_ref is not null)),
  check (expires_at is null or expires_at > starts_at)
);
create unique index discount_code_unique on discount_campaigns (upper(code)) where code is not null;
create index on discount_campaigns (status, starts_at, expires_at);

create table discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references discount_campaigns(id),
  user_id uuid not null references users(id),
  order_id uuid not null references orders(id),
  discount_kobo bigint not null check (discount_kobo > 0),
  seller_funded_kobo bigint not null default 0,
  platform_funded_kobo bigint not null default 0,
  status text not null default 'reserved' check (status in ('reserved','confirmed','released')),
  redeemed_at timestamptz not null default now(),
  unique (campaign_id, order_id)
);
create index on discount_redemptions (campaign_id, status);
create index on discount_redemptions (user_id, campaign_id);

create table referral_program_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  suspended boolean not null default false,
  period_days int not null default 30 check (period_days > 0),
  reward_type text not null default 'fixed' check (reward_type in ('fixed','percentage')),
  referrer_reward bigint not null default 50000,
  referred_reward bigint not null default 50000,
  percentage_cap_kobo bigint,
  recipients text not null default 'both' check (recipients in ('referrer','referred','both')),
  max_referrals int not null default 5 check (max_referrals > 0),
  minimum_order_kobo bigint not null default 0,
  reward_expiry_days int not null default 60 check (reward_expiry_days > 0),
  updated_at timestamptz not null default now()
);
insert into referral_program_settings default values on conflict do nothing;

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references users(id),
  referred_user_id uuid not null unique references users(id),
  referral_code text not null,
  registered_at timestamptz not null default now(),
  qualifying_order_id uuid references orders(id),
  status text not null default 'pending_purchase' check (status in ('pending_purchase','awaiting_completion','successful','reward_issued','rejected','expired','review')),
  flags text[] not null default '{}',
  signup_ip_hash text,
  rejection_reason text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  qualified_at timestamptz,
  check (referrer_id <> referred_user_id)
);
create index on referrals (referrer_id, status);
create index on referrals (signup_ip_hash, registered_at);

create table referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id),
  user_id uuid not null references users(id),
  reward_kobo bigint not null check (reward_kobo > 0),
  status text not null default 'issued' check (status in ('issued','reversed')),
  expires_at timestamptz not null,
  issued_at timestamptz not null default now(),
  unique (referral_id, user_id)
);

-- Credits are spendable lots. Balances are never stored; they come from lots and every move is in the ledger.
create table wallet_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  remaining_kobo bigint not null check (remaining_kobo >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (remaining_kobo <= amount_kobo)
);
create index on wallet_lots (user_id, expires_at);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  transaction_type text not null check (transaction_type in ('reward','redemption','reversal','expiry','clawback')),
  amount_kobo bigint not null, -- positive adds, negative spends
  reference text not null unique,
  description text not null,
  order_id uuid references orders(id),
  allocations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index on wallet_transactions (user_id, created_at desc);

create or replace view user_reward_wallets with (security_invoker = true) as
  select u.id as user_id,
    coalesce((select sum(remaining_kobo) from wallet_lots l where l.user_id = u.id and l.expires_at > now()), 0)::bigint as available_kobo,
    coalesce((select sum(amount_kobo) from wallet_transactions t where t.user_id = u.id and t.transaction_type = 'reward'), 0)::bigint as earned_kobo,
    coalesce((select -sum(amount_kobo) from wallet_transactions t where t.user_id = u.id and t.transaction_type in ('redemption','reversal')), 0)::bigint as redeemed_kobo
  from users u;

-- Append-only money trail. A trigger refuses updates and deletes.
create table financial_ledger (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  entry_type text not null,
  order_id uuid references orders(id),
  storefront_id uuid references storefronts(id),
  transaction_id uuid references transactions(id),
  amount_kobo bigint not null,
  memo text,
  created_at timestamptz not null default now()
);
create index on financial_ledger (storefront_id, created_at desc);
create index on financial_ledger (order_id);
create or replace function ledger_immutable() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'LEDGER_IMMUTABLE: ledger entries cannot be changed' using errcode = 'P0001'; end $$;
create trigger ledger_no_change before update or delete on financial_ledger for each row execute function ledger_immutable();

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index one_open_deletion on account_deletion_requests (user_id) where status = 'scheduled';

create table storefront_pickup_points (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references storefronts(id) on delete cascade,
  name text not null,
  instructions text,
  available_days text,
  time_window text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on storefront_pickup_points (storefront_id) where is_active;

create table service_updates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage text not null,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on service_updates (order_id, created_at);

create table service_locations (
  order_id uuid primary key references orders(id) on delete cascade,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  is_sharing boolean not null default true,
  updated_at timestamptz not null default now()
);

drop view if exists seller_balances;
create view seller_balances with (security_invoker = true) as
  select s.id as storefront_id,
    coalesce((select sum(net_kobo) from commissions c where c.storefront_id = s.id and c.status = 'earned'), 0)::bigint as earned_kobo,
    coalesce((select sum(commission_kobo) from commissions c where c.storefront_id = s.id and c.status = 'owed'), 0)::bigint as owed_kobo,
    coalesce((select sum(amount_kobo) from seller_payouts p where p.storefront_id = s.id and p.status = 'paid'), 0)::bigint as paid_out_kobo,
    coalesce((select sum(amount_kobo) from seller_payouts p where p.storefront_id = s.id and p.status in ('requested','processing')), 0)::bigint as requested_kobo,
    coalesce((select sum(total_kobo + platform_funded_kobo + wallet_credit_kobo) from orders o where o.storefront_id = s.id and o.payment_status = 'paid' and o.status <> 'completed' and o.status <> 'cancelled'), 0)::bigint as pending_kobo
  from storefronts s;

grant select on seller_balances to campora_app;
grant select on discount_campaigns, referral_program_settings, referrals, referral_rewards, wallet_lots, wallet_transactions, user_reward_wallets,
  financial_ledger, storefront_pickup_points, service_updates, service_locations, discount_redemptions, account_deletion_requests, verification_reviews to campora_app;
grant insert, update, delete on storefront_pickup_points to campora_app;

alter table discount_campaigns enable row level security;
alter table discount_redemptions enable row level security;
alter table referral_program_settings enable row level security;
alter table referrals enable row level security;
alter table referral_rewards enable row level security;
alter table wallet_lots enable row level security;
alter table wallet_transactions enable row level security;
alter table financial_ledger enable row level security;
alter table account_deletion_requests enable row level security;
alter table storefront_pickup_points enable row level security;
alter table service_updates enable row level security;
alter table service_locations enable row level security;
alter table verification_reviews enable row level security;

create policy admin_only on discount_campaigns for select to campora_app using (app_is_admin());
create policy own_or_admin on discount_redemptions for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy read_public on referral_program_settings for select to campora_app using (true);
create policy parties on referrals for select to campora_app using (referrer_id = app_uid() or referred_user_id = app_uid() or app_is_admin());
create policy own_or_admin on referral_rewards for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy own_or_admin on wallet_lots for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy own_or_admin on wallet_transactions for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy store_or_admin on financial_ledger for select to campora_app using (app_owns_store(storefront_id) or app_is_admin());
create policy own_or_admin on account_deletion_requests for select to campora_app using (user_id = app_uid() or app_is_admin());
create policy pickup_read on storefront_pickup_points for select to campora_app using (is_active or app_owns_store(storefront_id) or app_is_admin());
create policy pickup_write on storefront_pickup_points for all to campora_app using (app_owns_store(storefront_id)) with check (app_owns_store(storefront_id));
create policy order_parties on service_updates for select to campora_app using (exists(select 1 from orders o where o.id = order_id));
create policy order_parties on service_locations for select to campora_app using (is_sharing and exists(select 1 from orders o where o.id = order_id));
create policy admin_only on verification_reviews for select to campora_app using (app_is_admin());
