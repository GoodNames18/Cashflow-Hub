import { CFH_OWNER_ID } from './cfh-store.mjs';
const pages={life_log:'lifeLog',twice_as_nyce:'twice',printing:'printing',cash_in_out:'gcash',money_flow:'expenses',konek2card:'test',rental:'rental'};
const sheets={life_log:'Life Log',twice_as_nyce:'TwiceAsNyce',printing:'Printing Business',cash_in_out:'Cash In/Out',money_flow:'Money Flow',konek2card:'Konek2Card',rental:'Rental'};
export function installTestRestorePanel(store,writes) {
  if(document.getElementById('cfhTestRestore'))return;
  const opener=document.createElement('button');
  opener.id='cfhTestRestore';opener.textContent='Restore test entries';
  opener.style.cssText='position:fixed;bottom:38px;right:12px;z-index:9900;padding:8px 12px;font-size:13px;background:white;border:1px solid #777;border-radius:10px';
  const dialog=document.createElement('dialog');
  dialog.style.cssText='max-width:560px;width:85%;max-height:75vh;overflow:auto;border-radius:16px;padding:20px';
  const title=document.createElement('h3');title.textContent='Deleted test transactions';
  const note=document.createElement('p');note.textContent='These are real Supabase records. Run cfhSyncPending manually to copy changes to Google Sheets.';
  const list=document.createElement('div');
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();
  dialog.append(title,note,list,close);document.body.append(opener,dialog);
  async function load() {
    list.textContent='Loading…';
    try {
      const {data,error}=await store.client.from('cfh_records').select('*')
        .eq('owner_id',CFH_OWNER_ID).contains('payload',{cfh_preview_test:true})
        .not('deleted_at','is',null).order('deleted_at',{ascending:false}).limit(100);
      if(error)throw error;
      list.replaceChildren();
      if(!data.length)list.textContent='No deleted test transactions.';
      for(const record of data) {
        const row=document.createElement('div');row.style.cssText='border-bottom:1px solid #aaa;padding:12px 0';
        const label=document.createElement('p');
        label.textContent=sheets[record.tab_key]+' · '+record.category+' · '+record.description+
          (record.amount===null?'':' · '+Number(record.amount).toLocaleString('en-PH',{style:'currency',currency:'PHP'}));
        const button=document.createElement('button');button.textContent='Restore';
        button.onclick=async()=>{
          button.disabled=true;button.textContent='Restoring…';
          try {
            await writes.request({action:'transactionRestore',sheet:sheets[record.tab_key],id:record.id,rowFingerprint:record.id+':'+record.revision});
            row.remove();
            window.cfhRefreshTestTab?.(pages[record.tab_key]);
            if(!list.children.length)list.textContent='No deleted test transactions.';
          }catch(error){button.disabled=false;button.textContent='Restore';label.textContent=error.message;}
        };
        row.append(label,button);list.append(row);
      }
    }catch(error){list.textContent=error.message;}
  }
  opener.onclick=()=>{dialog.showModal();load();};
}
