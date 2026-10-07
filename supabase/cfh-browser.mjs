import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { CashflowStore, CFH_PROJECT_URL, CFH_PUBLISHABLE_KEY } from './cfh-store.mjs?v=live2';
import { CashflowSnapshot, openHistoryCache } from './cfh-snapshot.mjs?v=live2';
import { CashflowReadApi } from './cfh-read-api.mjs?v=interest-compat1';
import { CashflowWriteApi } from './cfh-write-api.mjs?v=interest-compat1';
import { loadCashflowSettings } from './cfh-settings.mjs?v=live2';
const enabled=true;
if(enabled) {
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  ready.catch(()=>{});
  window.cashflowDatabase={request:async(params,options)=>{
    const api=await ready;
    if(api.reads.handles(params.action))return api.reads.request(params,!!options?.skipCache);
    if(api.writes.handles(params.action))return api.writes.request(params);
    if(params.action==='restoreRevisions')return {success:true,revisions:{}};
    throw new Error('This action is not supported. Refresh the app and try again.');
  }};
  const client=createClient(CFH_PROJECT_URL,CFH_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const store=new CashflowStore(client);
  async function start() {
    await store.requireOwner();
    const settings=await loadCashflowSettings(client);
    let cache=null;
    try {cache=await openHistoryCache();} catch(error){console.warn('History cache unavailable',error);}
    const snapshot=new CashflowSnapshot(store,cache);
    const reads=new CashflowReadApi(snapshot,settings.referenceCells,settings.konekSeed);
    const writes=new CashflowWriteApi(store,reads,{testOnly:false,allowFinancial:true});
    snapshot.onChange(tab=>window.dispatchEvent(new CustomEvent('cashflow-data-changed',{detail:{tab}})));
    resolveReady({reads,writes});
    const tabs=['cash_in_out','life_log','twice_as_nyce','printing','money_flow','konek2card','rental'];
    // Warm every tab from its persistent cache; each cached load refreshes in the background.
    await Promise.allSettled(tabs.map(tab=>snapshot.load(tab)));
    let checking=false;
    async function checkUpdates() {
      if(checking||document.hidden)return;
      checking=true;
      try {
        for(let i=0;i<tabs.length;i+=2)
          await Promise.allSettled(tabs.slice(i,i+2).map(tab=>snapshot.refreshChanges(tab)));
      }finally{checking=false;}
    }
    window.setInterval(checkUpdates,15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdates();});
    window.addEventListener('online',checkUpdates);
    window.addEventListener('focus',checkUpdates);
  }
  try {await start();} catch(error) {
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:#f5f5fa;display:grid;place-items:center;padding:24px';
    overlay.innerHTML='<form style="max-width:360px;width:100%;display:grid;gap:16px"><h2>Cashflow Hub</h2><p>Sign in with your Cashflow Hub app account.</p><input name="email" type="email" autocomplete="username" placeholder="Email" required><input name="password" type="password" autocomplete="current-password" placeholder="Password" required><button>Sign in</button><p role="status"></p></form>';
    document.body.append(overlay);
    const form=overlay.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();button.disabled=true;status.textContent='Signing in…';
      try {
        await store.signIn(form.elements.email.value,form.elements.password.value);
        form.elements.password.value='';await start();overlay.remove();
      }catch(error){status.textContent=error.message;button.disabled=false;}
    });
  }
}
