-- Run in Cashflow Hub only. Backend service key only; no browser access.
begin;
create or replace function public.cfh_apply_sheet_edit(
  p_id uuid, p_expected_revision bigint, p_record jsonb
) returns public.cfh_records language plpgsql security invoker set search_path='' as $$
declare r public.cfh_records;
begin
  select * into r from public.cfh_records where id=p_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if r.owner_id <> '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Wrong project owner';
  end if;
  if r.revision <> p_expected_revision then
    raise exception 'Transaction changed in the app; resolve before syncing' using errcode='40001';
  end if;
  if r.deleted_at is not null then raise exception 'Restore the transaction before editing it'; end if;
  update public.cfh_records set
    occurred_at=(p_record->>'occurred_at')::timestamptz,
    amount=(p_record->>'amount')::numeric,
    category=coalesce(p_record->>'category',''),description=coalesce(p_record->>'description',''),
    payload=p_record->'payload',source_values=p_record->'source_values'
  where id=p_id returning * into r;
  return r;
end $$;
create or replace function public.cfh_restore_from_sheet(p_id uuid,p_expected_revision bigint)
returns public.cfh_records language plpgsql security invoker set search_path='' as $$
declare r public.cfh_records;
begin
  select * into r from public.cfh_records where id=p_id for update;
  if not found or r.owner_id <> '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Transaction not found';
  end if;
  if r.deleted_at is null then return r; end if;
  if r.revision <> p_expected_revision then raise exception 'Transaction changed' using errcode='40001'; end if;
  update public.cfh_records set deleted_at=null where id=p_id returning * into r;
  return r;
end $$;
revoke all on function public.cfh_apply_sheet_edit(uuid,bigint,jsonb),
  public.cfh_restore_from_sheet(uuid,bigint) from public,anon,authenticated;
grant execute on function public.cfh_apply_sheet_edit(uuid,bigint,jsonb),
  public.cfh_restore_from_sheet(uuid,bigint) to service_role;
commit;
select proname from pg_proc where proname in ('cfh_apply_sheet_edit','cfh_restore_from_sheet');
