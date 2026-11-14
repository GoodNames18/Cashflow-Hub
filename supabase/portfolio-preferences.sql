create table public.cfh_portfolio_preferences (
 owner_id uuid not null references auth.users(id),
 name text not null check (name in ('watchlist','brokers')),
 items jsonb not null check (jsonb_typeof(items) = 'array'),
 primary key (owner_id,name)
);
alter table public.cfh_portfolio_preferences enable row level security;
create policy cfh_portfolio_preferences_owner on public.cfh_portfolio_preferences
 for all to authenticated
 using (owner_id = (select auth.uid()))
 with check (owner_id = (select auth.uid()));
revoke all on public.cfh_portfolio_preferences from anon;
grant select, insert, update on public.cfh_portfolio_preferences to authenticated;
alter publication supabase_realtime add table public.cfh_portfolio_preferences;
