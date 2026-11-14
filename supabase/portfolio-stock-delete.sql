-- Allow the portfolio owner to remove stock purchase records only.
begin;
grant delete on public.cfh_portfolio_records to authenticated;
create policy cfh_portfolio_delete_stock_purchase
 on public.cfh_portfolio_records for delete to authenticated
 using (
  owner_id = (select auth.uid())
  and owner_id = '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid
  and payload->>'kind' = 'purchase'
  and payload->>'asset' = 'stock'
 );
commit;
