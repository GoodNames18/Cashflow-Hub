import { createClient } from './vendor/supabase-js.mjs';
import { CashflowStore, CFH_PROJECT_URL, CFH_PUBLISHABLE_KEY } from './cfh-store.mjs?v=transaction-edit1';
import { CashflowSnapshot, openHistoryCache } from './cfh-snapshot.mjs?v=offline-home1';
import { CashflowReadApi } from './cfh-read-api.mjs?v=offline-home1';
import { CashflowWriteApi } from './cfh-write-api.mjs?v=transaction-edit1';
import { loadCashflowSettings } from './cfh-settings.mjs?v=offline-home1';
import { startCalendarSync } from './cfh-calendar-sync.mjs?v=events1';
import {startPortfolioSync} from './cfh-portfolio.mjs?v=portfolio3';
import {CashflowOfflineQueue,openOfflineQueue,mountHomeSyncStatus} from './cfh-offline-queue.mjs?v=offline-home1';
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
    await store.requireOwner({allowOffline:true});

    startPortfolioSync(client,'161ecab1-d1d7-4fef-a089-a7300b9da774');
    const settings=await loadCashflowSettings(client);
    let cache=null;
    try {cache=await openHistoryCache();} catch(error){console.warn('History cache unavailable',error);}
    const snapshot=new CashflowSnapshot(store,cache);
    const reads=new CashflowReadApi(snapshot,settings.referenceCells,settings.konekSeed);
    const outbox=await new CashflowOfflineQueue(store,reads,await openOfflineQueue(),{settings:async()=>{
      const fresh=await loadCashflowSettings(client,{force:true});reads.referenceCells=fresh.referenceCells;reads.konekSeed=fresh.konekSeed;
    }}).init();
    snapshot.pendingRecords=tab=>outbox.records(tab);
    const writes=new CashflowWriteApi(store,reads,{testOnly:false,allowFinancial:true});
    writes.outbox=outbox;
    window.cfhHomeOfflineQueue=outbox;
    mountHomeSyncStatus(outbox);
    snapshot.onChange(tab=>window.dispatchEvent(new CustomEvent('cashflow-data-changed',{detail:{tab}})));
    resolveReady({reads,writes});
    if(!window.cfhCalendarSyncStarted){window.cfhCalendarSyncStarted=true;void startCalendarSync(client,'161ecab1-d1d7-4fef-a089-a7300b9da774').catch(console.warn);}
    client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){try{localStorage.removeItem('cfh-home-verified-owner-v1');}catch{}}});
    const tabs=['cash_in_out','life_log','twice_as_nyce','printing','money_flow','konek2card','rental'];
    // Warm every tab from its persistent cache; each cached load refreshes in the background.
    await Promise.allSettled(tabs.map(tab=>snapshot.load(tab)));
    let checking=false;
    async function checkUpdates() {
      if(checking||document.hidden||navigator.onLine===false)return;
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
    const cachedOwner=store.cachedOwner();
    if(cachedOwner){
      overlay.querySelector('p').textContent=error.message+' Connect to the internet once, then tap Try again.';
      overlay.querySelectorAll('input').forEach(input=>{input.required=false;input.hidden=true;});
      overlay.querySelector('button').textContent='Try again';
    }
    document.body.append(overlay);
    const form=overlay.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();button.disabled=true;status.textContent='Signing in…';
      try {
        if(!cachedOwner)await store.signIn(form.elements.email.value,form.elements.password.value);
        form.elements.password.value='';await start();overlay.remove();
      }catch(error){status.textContent=error.message;button.disabled=false;}
    });
  }
}

