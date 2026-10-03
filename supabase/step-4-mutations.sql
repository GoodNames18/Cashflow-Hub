-- Cashflow Hub only: mssrsogwxvxyyjnavdiu. Run after Steps 1–3.
-- Adds owner mutations and a transactional Sheets queue. Does not switch the app.
begin;
create schema if not exists cfh_private;
revoke all on schema cfh_private from public, anon, authenticated;

drop policy if exists cfh_owner_insert on public.cfh_records;
create policy cfh_owner_insert on public.cfh_records for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (select auth.uid()) = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid
  and source = 'app' and deleted_at is null
);
drop policy if exists cfh_owner_update on public.cfh_records;
create policy cfh_owner_update on public.cfh_records for update to authenticated
using (
  owner_id = (select auth.uid())
  and (select auth.uid()) = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid
)
with check (
  owner_id = (select auth.uid())
  and (select auth.uid()) = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid
);
-- No physical delete permission. Owner identity, source and request ID are immutable.
grant insert (owner_id, tab_key, occurred_at, amount, category, description,
  payload, source_values, client_request_id) on public.cfh_records to authenticated;
grant update (occurred_at, amount, category, description, payload, source_values,
  deleted_at) on public.cfh_records to authenticated;

create or replace function cfh_private.revise_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := clock_timestamp();
  else
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.tab_key is distinct from old.tab_key
      or new.client_request_id is distinct from old.client_request_id then
      raise exception 'Record identity is immutable' using errcode = '22023';
    end if;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function cfh_private.revise_record() from public, anon, authenticated;
drop trigger if exists cfh_revise_record on public.cfh_records;
create trigger cfh_revise_record before insert or update on public.cfh_records
for each row execute function cfh_private.revise_record();

-- Privileged trigger writes only a snapshot of the row that passed owner RLS.
-- Private schema, no direct EXECUTE grant, no browser access to the queue.
create or replace function cfh_private.enqueue_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare op text;
begin
  if new.owner_id <> '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Unexpected Cashflow Hub owner' using errcode = '42501';
  end if;
  if auth.uid() is distinct from new.owner_id
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' is distinct from 'service_role'
    and session_user <> 'postgres' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if new.deleted_at is not null then op := 'delete';
  elsif tg_op = 'UPDATE' and old.deleted_at is not null then op := 'restore';
  else op := 'upsert'; end if;
  insert into public.cfh_sync_outbox(record_id, revision, operation, snapshot)
    values(new.id, new.revision, op, to_jsonb(new))
    on conflict (record_id, revision) do nothing;
  return new;
end $$;
revoke all on function cfh_private.enqueue_record() from public, anon, authenticated;
drop trigger if exists cfh_enqueue_record on public.cfh_records;
create trigger cfh_enqueue_record after insert or update on public.cfh_records
for each row execute function cfh_private.enqueue_record();

-- Retrying the same client_request_id returns the existing saved record.
create or replace function public.cfh_save_record(
  p_request_id uuid, p_tab_key text, p_occurred_at timestamptz,
  p_amount numeric, p_category text, p_description text,
  p_payload jsonb, p_source_values jsonb
) returns public.cfh_records
language plpgsql security invoker set search_path = '' as $$
declare saved public.cfh_records;
begin
  if auth.uid() is distinct from '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.cfh_records(owner_id, client_request_id, tab_key, occurred_at,
    amount, category, description, payload, source_values)
  values(auth.uid(), p_request_id, p_tab_key, p_occurred_at, p_amount,
    p_category, p_description, p_payload, p_source_values)
  on conflict(owner_id, client_request_id) do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.cfh_records
      where owner_id = auth.uid() and client_request_id = p_request_id;
    if saved.tab_key is distinct from p_tab_key
      or saved.occurred_at is distinct from p_occurred_at
      or saved.amount is distinct from p_amount
      or saved.category is distinct from p_category
      or saved.description is distinct from p_description
      or saved.payload is distinct from p_payload
      or saved.source_values is distinct from p_source_values then
      raise exception 'Request ID already used for another transaction' using errcode = '22023';
    end if;
  end if;
  return saved;
end $$;

-- Compare-and-set prevents an outdated delete from removing a restored/edited row.
create or replace function public.cfh_set_deleted(
  p_id uuid, p_expected_revision bigint, p_deleted boolean
) returns public.cfh_records
language plpgsql security invoker set search_path = '' as $$
declare saved public.cfh_records;
begin
  if auth.uid() is distinct from '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into saved from public.cfh_records
    where id = p_id and owner_id = auth.uid() for update;
  if saved.id is null then raise exception 'Transaction not found' using errcode = 'P0002'; end if;
  -- Exact retry of a previously completed delete/restore is harmless.
  if (saved.deleted_at is not null) = p_deleted then return saved; end if;
  if saved.revision <> p_expected_revision then
    raise exception 'Transaction changed; refresh this transaction and retry' using errcode = '40001';
  end if;
  update public.cfh_records set deleted_at =
    case when p_deleted then clock_timestamp() else null end
    where id = p_id and owner_id = auth.uid() returning * into saved;
  return saved;
end $$;
revoke all on function public.cfh_save_record(uuid,text,timestamptz,numeric,text,text,jsonb,jsonb)
  from public, anon;
revoke all on function public.cfh_set_deleted(uuid,bigint,boolean) from public, anon;
grant execute on function public.cfh_save_record(uuid,text,timestamptz,numeric,text,text,jsonb,jsonb),
  public.cfh_set_deleted(uuid,bigint,boolean) to authenticated;

-- Loan payment + rebate must commit together. Retrying the bundle is idempotent.
create or replace function public.cfh_save_bundle(p_records jsonb)
returns setof public.cfh_records language plpgsql security invoker set search_path = '' as $$
declare item jsonb; saved public.cfh_records;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 20 then
    raise exception 'Expected 1 to 20 transactions' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_records) loop
    saved := public.cfh_save_record(
      (item->>'p_request_id')::uuid, item->>'p_tab_key',
      (item->>'p_occurred_at')::timestamptz, (item->>'p_amount')::numeric,
      item->>'p_category', item->>'p_description',
      item->'p_payload', item->'p_source_values'
    );
    return next saved;
  end loop;
end $$;
revoke all on function public.cfh_save_bundle(jsonb) from public, anon;
grant execute on function public.cfh_save_bundle(jsonb) to authenticated;

alter table public.cfh_sync_outbox add column if not exists lease_token uuid;
-- Worker-only queue leases; a crashed worker's jobs can be reclaimed.
create or replace function public.cfh_claim_sync(p_limit integer default 25)
returns setof public.cfh_sync_outbox
language sql security invoker set search_path = '' as $$
  with picked as (
    select id from public.cfh_sync_outbox
    where ((status in ('pending','failed') and available_at <= now())
      or (status = 'processing' and lease_until < now()))
    order by created_at, id
    limit greatest(1, least(p_limit, 100)) for update skip locked
  )
  update public.cfh_sync_outbox q set status = 'processing',
    attempts = attempts + 1, lease_until = now() + interval '2 minutes',
    lease_token = gen_random_uuid()
  from picked where q.id = picked.id returning q.*;
$$;
create or replace function public.cfh_finish_sync(
  p_id uuid, p_lease_token uuid, p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.cfh_sync_outbox set
    status = case when p_error is null then 'done' else 'failed' end,
    completed_at = case when p_error is null then clock_timestamp() else null end,
    last_error = left(p_error, 1000),
    available_at = now() + interval '30 seconds' * least(attempts, 20),
    lease_until = null, lease_token = null
  where id = p_id and status = 'processing' and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end $$;
revoke all on function public.cfh_claim_sync(integer),
  public.cfh_finish_sync(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.cfh_claim_sync(integer),
  public.cfh_finish_sync(uuid,uuid,text) to service_role;
commit;

-- Verification only: no test transactions added to your real data.
select count(*) filter (where deleted_at is null) as active,
  count(*) filter (where deleted_at is not null) as deleted from public.cfh_records;
select tablename, policyname, cmd from pg_policies
  where schemaname = 'public' and tablename like 'cfh_%' order by tablename, cmd;
