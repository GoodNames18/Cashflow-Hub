create table if not exists public.cfh_calendar_state (
 owner_id uuid not null references auth.users(id) on delete cascade,
 storage_key text not null check(storage_key in ('cfh_card_panel_preferences_v1','cfh_eastwest_cycle_overrides_v1','cfh_calendar_bells_v1','cfh_calendar_event_deletions_v1','cfh_metrobank_due_overrides_v1','cfh_metrobank_status_v1','cfh_calendar_entries_v1')),
 value text,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(owner_id,storage_key)
);
alter table public.cfh_calendar_state enable row level security;
revoke all on public.cfh_calendar_state from anon;
grant select,insert,update on public.cfh_calendar_state to authenticated;
create policy cfh_calendar_state_owner on public.cfh_calendar_state for all to authenticated
 using(owner_id=(select auth.uid()) and owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774')
 with check(owner_id=(select auth.uid()) and owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774');
create or replace function public.cfh_save_calendar_state(p_key text,p_value text,p_revision bigint)
returns setof public.cfh_calendar_state language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is distinct from '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then raise exception 'Not authorized'; end if;
 if octet_length(coalesce(p_value,''))>500000 then raise exception 'Calendar data too large'; end if;
 if p_revision=0 then
  return query insert into public.cfh_calendar_state(owner_id,storage_key,value) values(auth.uid(),p_key,p_value)
   on conflict do nothing returning *;
 else
  return query update public.cfh_calendar_state set value=p_value,revision=revision+1,updated_at=now()
   where owner_id=auth.uid() and storage_key=p_key and revision=p_revision returning *;
 end if;
end $$;
revoke all on function public.cfh_save_calendar_state(text,text,bigint) from public,anon;
grant execute on function public.cfh_save_calendar_state(text,text,bigint) to authenticated;
