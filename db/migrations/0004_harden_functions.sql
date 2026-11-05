-- Keep helper functions away from Supabase's public API roles, and pin their search path.
do $$
declare f text;
begin
  for f in select unnest(array['app_uid()','setting_jsonb(text)','app_is_admin()','app_owns_store(uuid)','app_store_public(uuid)','effective_plan(uuid)','enforce_photo_limit()','enforce_listing_rules()','enforce_order_transition()']) loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', f); end if;
    execute format('grant execute on function %s to campora_app', f);
  end loop;
end $$;
alter function app_uid() set search_path = public;
alter function enforce_listing_rules() set search_path = public;
alter function enforce_order_transition() set search_path = public;
