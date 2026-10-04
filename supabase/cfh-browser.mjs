import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { CashflowStore, CFH_PROJECT_URL, CFH_PUBLISHABLE_KEY } from './cfh-store.mjs';
import { CashflowSnapshot, openHistoryCache } from './cfh-snapshot.mjs';
import { CashflowReadApi } from './cfh-read-api.mjs';
import { CashflowWriteApi } from './cfh-write-api.mjs';
import { loadCashflowSettings } from './cfh-settings.mjs';
const enabled=new URL(location.href).searchParams.get('database')==='supabase';
if(enabled) {
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  ready.catch(()=>{});
  window.cashflowDatabase={request:async(params,options)=>{
    const api=await ready;
    if(api.reads.handles(params.action))return api.reads.request(params,!!options?.skipCache);
    if(api.writes.handles(params.action))return api.writes.request(params);
    if(params.action==='restoreRevisions')return {success:true,revisions:{}};
    throw new Error('This function is not ready for the Supabase preview: '+params.action);
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
    const writes=new CashflowWriteApi(store,reads);
    resolveReady({reads,writes});
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
