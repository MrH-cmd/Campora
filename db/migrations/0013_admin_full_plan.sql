-- Admins get the top plan everywhere: templates, effects, listing limits, analytics and coupons.
-- Everything that checks a plan reads it through this one function, so this is the only place it changes.
create or replace function effective_plan(p_seller uuid) returns subscription_plans
language sql stable security definer set search_path = public as $$
  select p.* from subscription_plans p
  left join subscriptions s on s.plan_id = p.id and s.seller_id = p_seller
     and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
  order by
    case when exists (select 1 from users u where u.id = p_seller and u.role = 'admin') then -p.sort else 0 end,
    (s.id is not null) desc, p.sort asc
  limit 1
$$;
revoke execute on function effective_plan(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke execute on function effective_plan(uuid) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke execute on function effective_plan(uuid) from authenticated; end if;
end $$;
grant execute on function effective_plan(uuid) to campora_app;
