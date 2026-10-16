-- Enables the portfolio history feature to sync dividend entries.
-- Applied to the Cashflow Hub Supabase project as migration: allow_portfolio_dividends
alter table public.cfh_portfolio_records
  drop constraint cfh_portfolio_records_payload_check;

alter table public.cfh_portfolio_records
  add constraint cfh_portfolio_records_payload_check
  check (
    jsonb_typeof(payload) = 'object'
    and payload->>'kind' in ('purchase', 'quote', 'cash', 'dividend')
  );
