create table public.cfh_portfolio_records (
 owner_id uuid not null references auth.users(id),
 id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'kind' in ('purchase','quote','cash','dividend')),
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table public.cfh_portfolio_records enable row level security;
create policy cfh_portfolio_read on public.cfh_portfolio_records for select to authenticated using(owner_id=(select auth.uid()) and owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid);
create policy cfh_portfolio_insert on public.cfh_portfolio_records for insert to authenticated with check(owner_id=(select auth.uid()) and owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid);
revoke all on public.cfh_portfolio_records from anon;
grant select,insert on public.cfh_portfolio_records to authenticated;
alter publication supabase_realtime add table public.cfh_portfolio_records;