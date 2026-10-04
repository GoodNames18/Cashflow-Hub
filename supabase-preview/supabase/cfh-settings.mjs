import { CFH_OWNER_ID } from './cfh-store.mjs?v=financial4';
export async function loadCashflowSettings(client) {
  const {data,error}=await client.from('cfh_settings').select('setting_key,value')
    .eq('owner_id',CFH_OWNER_ID).in('setting_key',['konek_balance_seed','workbook_reference_snapshot']);
  if(error)throw error;
  const settings=Object.fromEntries(data.map(row=>[row.setting_key,row.value]));
  if(!settings.konek_balance_seed)throw new Error('Run Cashflow Hub Step 4 to configure private balance settings.');
  const reference=settings.workbook_reference_snapshot;
  if(!reference)throw new Error('Cashflow Hub import settings are missing.');
  return {konekSeed:settings.konek_balance_seed,
    referenceCells:{'Printing Business':reference.printing.cells}};
}
