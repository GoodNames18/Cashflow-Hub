create schema if not exists cfh_private;
revoke all on schema cfh_private from public,anon,authenticated;
grant usage on schema cfh_private to service_role;
create or replace function cfh_private.android_release_signing()
returns jsonb language plpgsql security definer set search_path='' as $$
declare material jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Not authorized'; end if;
 select decrypted_secret::jsonb into material from vault.decrypted_secrets where name='cfh_android_release_signing_v1';
 if material is null then raise exception 'Release signing key is not configured'; end if;
 return material;
end $$;
revoke all on function cfh_private.android_release_signing() from public,anon,authenticated;
grant execute on function cfh_private.android_release_signing() to service_role;
create or replace function public.cfh_android_release_signing()
returns jsonb language sql security invoker set search_path='' as $$ select cfh_private.android_release_signing() $$;
revoke all on function public.cfh_android_release_signing() from public,anon,authenticated;
grant execute on function public.cfh_android_release_signing() to service_role;
