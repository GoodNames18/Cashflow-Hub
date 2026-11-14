create table public.cfh_portfolio_activity (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id),
 occurred_at timestamptz not null default statement_timestamp(),
 operation text not null check (operation in ('Added','Edited','Deleted','Restored')),
 source text not null check (source in ('record','watchlist','brokers')),
 record_id uuid,
 before_data jsonb,
 after_data jsonb
);
create index cfh_portfolio_activity_owner_idx on public.cfh_portfolio_activity (owner_id,id desc);
create index cfh_portfolio_activity_record_idx on public.cfh_portfolio_activity (owner_id,record_id,id desc);
alter table public.cfh_portfolio_activity enable row level security;
revoke all on public.cfh_portfolio_activity from anon, authenticated;
grant select on public.cfh_portfolio_activity to authenticated;
create policy cfh_portfolio_activity_owner on public.cfh_portfolio_activity
 for select to authenticated using (owner_id = (select auth.uid()));
alter publication supabase_realtime add table public.cfh_portfolio_activity;

create function public.cfh_capture_portfolio_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 activity_owner uuid;
 entry_id uuid;
 entry_source text;
 previous_data jsonb;
 next_data jsonb;
 action text;
begin
 activity_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
 if tg_table_name = 'cfh_portfolio_records' then
  entry_source := 'record';
  entry_id := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op <> 'INSERT' then previous_data := old.payload; end if;
  if tg_op <> 'DELETE' then next_data := new.payload; end if;
 else
  entry_source := case when tg_op = 'DELETE' then old.name else new.name end;
  if tg_op <> 'INSERT' then previous_data := old.items; end if;
  if tg_op <> 'DELETE' then next_data := new.items; end if;
 end if;
 if previous_data is not distinct from next_data then return null; end if;
 action := case tg_op when 'DELETE' then 'Deleted' when 'UPDATE' then 'Edited' else 'Added' end;
 if tg_op = 'INSERT' and entry_id is not null and (
  select a.operation from public.cfh_portfolio_activity a
  where a.owner_id = activity_owner and a.record_id = entry_id order by a.id desc limit 1
 ) = 'Deleted' then action := 'Restored'; end if;
 insert into public.cfh_portfolio_activity(owner_id,operation,source,record_id,before_data,after_data)
 values(activity_owner,action,entry_source,entry_id,previous_data,next_data);
 return null;
end;
$$;
revoke all on function public.cfh_capture_portfolio_activity() from public, anon, authenticated;
create trigger cfh_capture_portfolio_records after insert or update or delete
 on public.cfh_portfolio_records for each row execute function public.cfh_capture_portfolio_activity();
create trigger cfh_capture_portfolio_preferences after insert or update or delete
 on public.cfh_portfolio_preferences for each row execute function public.cfh_capture_portfolio_activity();

grant update(payload) on public.cfh_portfolio_records to authenticated;
create policy cfh_portfolio_edit_purchase on public.cfh_portfolio_records for update to authenticated
 using (owner_id = (select auth.uid()) and owner_id = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid and payload->>'kind' = 'purchase')
 with check (owner_id = (select auth.uid()) and owner_id = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid and payload->>'kind' = 'purchase');

create function public.cfh_recently_deleted_portfolio()
returns setof public.cfh_portfolio_activity language sql stable security invoker set search_path = '' as $$
 select a.* from public.cfh_portfolio_activity a
 where a.owner_id = (select auth.uid()) and a.operation = 'Deleted'
 and a.record_id is not null
 and not exists (select 1 from public.cfh_portfolio_activity newer
   where newer.owner_id = a.owner_id and newer.record_id = a.record_id and newer.id > a.id)
 order by a.id desc
$$;
revoke all on function public.cfh_recently_deleted_portfolio() from public, anon;
grant execute on function public.cfh_recently_deleted_portfolio() to authenticated;

create function public.cfh_restore_portfolio(activity_ids bigint[]) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
 restored integer;
begin
 if coalesce(cardinality(activity_ids),0) = 0 then raise exception 'Choose records to restore.'; end if;
 insert into public.cfh_portfolio_records(owner_id,id,payload)
 select a.owner_id,a.record_id,a.before_data from public.cfh_recently_deleted_portfolio() a
 where a.id = any(activity_ids)
 on conflict (owner_id,id) do nothing;
 get diagnostics restored = row_count;
 if restored <> cardinality(activity_ids) then
  raise exception 'Deleted records changed. Refresh and try again.';
 end if;
 return restored;
end;
$$;
revoke all on function public.cfh_restore_portfolio(bigint[]) from public, anon;
grant execute on function public.cfh_restore_portfolio(bigint[]) to authenticated;
