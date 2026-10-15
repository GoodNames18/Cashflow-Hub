import { CFH_OWNER_ID } from './cfh-store.mjs?v=offline-home1';
const KEY='cfh-home-settings-v1:'+CFH_OWNER_ID;
export async function loadCashflowSettings(client,{force=false}={}) {
  let cached;try{cached=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
  if(!force&&cached?.konekSeed&&cached?.referenceCells)return cached;
  const {data,error}=await client.from('cfh_settings').select('setting_key,value')
    .eq('owner_id',CFH_OWNER_ID).in('setting_key',['konek_balance_seed','workbook_reference_snapshot']);
  if(error)throw error;
  const settings=Object.fromEntries(data.map(row=>[row.setting_key,row.value]));
  if(!settings.konek_balance_seed)throw new Error('Run Cashflow Hub Step 4 to configure private balance settings.');
  const reference=settings.workbook_reference_snapshot;
  if(!reference)throw new Error('Cashflow Hub import settings are missing.');
  const result={konekSeed:settings.konek_balance_seed,referenceCells:{'Printing Business':reference.printing.cells}};
  try{localStorage.setItem(KEY,JSON.stringify(result));}catch{}
  return result;
}
