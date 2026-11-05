-- Rules that must hold no matter which code path touches the data.
create or replace function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function setting_jsonb(k text) returns jsonb language sql stable security definer set search_path = public as $$
  select value from platform_settings where key = k $$;

create or replace function app_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where id = app_uid() and role = 'admin' and status = 'active') $$;

create or replace function app_owns_store(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from storefronts where id = s and owner_id = app_uid()) $$;

create or replace function app_store_public(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from storefronts where id = s and status = 'active') $$;

-- The plan a seller is really on right now. An expired paid plan falls back to the free plan
-- immediately, even if the daily sweep has not run yet.
create or replace function effective_plan(p_seller uuid) returns subscription_plans
language sql stable security definer set search_path = public as $$
  select p.* from subscription_plans p
  left join subscriptions s on s.plan_id = p.id and s.seller_id = p_seller
     and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
  order by (s.id is not null) desc, p.sort asc
  limit 1
$$;

-- Deliberately not security definer: it reads current_user to tell the app role from system work.
create or replace function enforce_listing_rules() returns trigger
language plpgsql as $$
declare
  plan subscription_plans;
  used int;
  review_required boolean;
  privileged boolean := current_user <> 'campora_app' or app_is_admin();
begin
  if tg_op = 'UPDATE' and old.status = 'removed' and new.status <> 'removed' and not privileged then
    raise exception 'LISTING_REMOVED: this listing was removed by moderators' using errcode = 'P0001';
  end if;
  if new.status in ('active','pending_review')
     and (tg_op = 'INSERT' or old.status not in ('active','pending_review')) then
    select * into plan from effective_plan((select owner_id from storefronts where id = new.storefront_id));
    select count(*) into used from listings
      where storefront_id = new.storefront_id and status in ('active','pending_review') and id <> new.id;
    if used >= plan.listing_limit then
      raise exception 'LISTING_LIMIT: your % plan allows % active listings', plan.name, plan.listing_limit
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
create trigger listing_rules before insert or update on listings
  for each row execute function enforce_listing_rules();

create or replace function enforce_photo_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare plan subscription_plans; used int;
begin
  select * into plan from effective_plan(
    (select s.owner_id from listings l join storefronts s on s.id = l.storefront_id where l.id = new.listing_id));
  select count(*) into used from listing_images where listing_id = new.listing_id;
  if used >= plan.photo_limit then
    raise exception 'PHOTO_LIMIT: your % plan allows % photos per listing', plan.name, plan.photo_limit
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger photo_limit before insert on listing_images
  for each row execute function enforce_photo_limit();

-- A paid order can only be completed or cancelled through the state machine.
create or replace function enforce_order_transition() returns trigger language plpgsql as $$
declare allowed order_status[];
begin
  if new.status = old.status then new.updated_at := now(); return new; end if;
  allowed := case old.status
    when 'pending' then array['accepted','cancelled']::order_status[]
    when 'accepted' then array['processing','ready_for_pickup','cancelled']::order_status[]
    when 'processing' then array['ready_for_pickup','cancelled']::order_status[]
    when 'ready_for_pickup' then array['completed','cancelled']::order_status[]
    else array[]::order_status[] end;
  if not new.status = any(allowed) then
    raise exception 'ORDER_TRANSITION: cannot move an order from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger order_transition before update on orders
  for each row execute function enforce_order_transition();

create or replace view storefront_ratings with (security_invoker = true) as
  select storefront_id, round(avg(rating)::numeric, 1) as rating, count(*)::int as review_count
  from reviews where not is_hidden group by storefront_id;

create or replace view listing_ratings with (security_invoker = true) as
  select listing_id, round(avg(rating)::numeric, 1) as rating, count(*)::int as review_count
  from reviews where not is_hidden group by listing_id;

-- One read model for every listing card: price after sale and storefront campaign, rating, cover, boost.
create or replace view listing_cards with (security_invoker = true) as
  select l.id, l.slug, l.title, l.kind, l.status, l.description, l.created_at, l.sold_count, l.is_sample,
    l.price_kobo, l.category_id, l.search, l.storefront_id,
    least(coalesce(l.sale_price_kobo, l.price_kobo),
          l.price_kobo * (100 - coalesce(c.percent_off, 0)) / 100) as effective_price_kobo,
    c.title as campaign_title,
    cat.name as category_name, cat.slug as category_slug,
    s.name as store_name, s.slug as store_slug, s.university_id, s.logo_path as store_logo,
    u.short_name as university_short,
    (select path from listing_images i where i.listing_id = l.id order by position limit 1) as cover,
    coalesce(r.rating, 0) as rating, coalesce(r.review_count, 0) as review_count,
    p.stock, svc.price_type, svc.is_available as service_available,
    case when l.kind = 'product' then coalesce(p.stock, 0) > 0 else coalesce(svc.is_available, false) end as in_stock,
    exists(select 1 from store_boosts b where b.listing_id = l.id and b.status = 'active'
           and b.placement = 'homepage_featured' and b.ends_at > now()) as featured,
    exists(select 1 from store_boosts b where b.status = 'active' and b.ends_at > now()
           and b.placement = 'search_priority' and (b.listing_id = l.id or (b.listing_id is null and b.storefront_id = l.storefront_id))) as search_boosted
  from listings l
  join storefronts s on s.id = l.storefront_id
  join categories cat on cat.id = l.category_id
  join universities u on u.id = s.university_id
  left join products p on p.listing_id = l.id
  left join services svc on svc.listing_id = l.id
  left join listing_ratings r on r.listing_id = l.id
  left join lateral (
    select title, percent_off from promotional_campaigns pc
    where pc.storefront_id = l.storefront_id and pc.is_active and pc.percent_off is not null
      and now() between pc.starts_at and pc.ends_at
    order by percent_off desc limit 1) c on true;

-- Money a seller can withdraw: net earned on online-paid orders, less payouts requested or paid.
create or replace view seller_balances with (security_invoker = true) as
  select s.id as storefront_id,
    coalesce((select sum(net_kobo) from commissions c where c.storefront_id = s.id and c.status = 'earned'), 0)::bigint as earned_kobo,
    coalesce((select sum(amount_kobo) from seller_payouts p where p.storefront_id = s.id and p.status = 'paid'), 0)::bigint as paid_out_kobo,
    coalesce((select sum(amount_kobo) from seller_payouts p where p.storefront_id = s.id and p.status = 'requested'), 0)::bigint as requested_kobo
  from storefronts s;
