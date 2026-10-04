-- Run only in Cashflow Hub (mssrsogwxvxyyjnavdiu).
begin;
create or replace function public.cfh_delete_from_sheet(p_id uuid,p_expected_revision bigint)
returns public.cfh_records language plpgsql security invoker set search_path='' as $$
declare r public.cfh_records;
begin
  select * into r from public.cfh_records where id=p_id for update;
  if not found or r.owner_id <> '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Transaction not found';
  end if;
  if r.deleted_at is not null then return r; end if;
  if r.revision <> p_expected_revision then raise exception 'Transaction changed; resolve deletion first' using errcode='40001'; end if;
  update public.cfh_records set deleted_at=clock_timestamp() where id=p_id returning * into r;
  return r;
end $$;
revoke all on function public.cfh_delete_from_sheet(uuid,bigint) from public,anon,authenticated;
grant execute on function public.cfh_delete_from_sheet(uuid,bigint) to service_role;
commit;
