-- Permit the signed-in Cashflow Hub client to call the existing optimistic edit RPC.
-- RLS remains enabled; cfh_owner_update restricts updates to the authenticated owner.
revoke all on function public.cfh_apply_sheet_edit(uuid, bigint, jsonb) from public, anon;
grant execute on function public.cfh_apply_sheet_edit(uuid, bigint, jsonb) to authenticated, service_role;

-- The RPC updates only these columns. Row access remains constrained by cfh_owner_update.
grant update (occurred_at, amount, category, description, payload, source_values)
  on table public.cfh_records to authenticated;
