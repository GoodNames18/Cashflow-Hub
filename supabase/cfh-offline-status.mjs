// Pending changes are durable; this indicator never reports a local write as synced.
export function mountOfflineStatus(queue){
 const style=document.createElement('style');style.textContent=`.cfh-offline-status{position:fixed;z-index:9500;top:calc(env(safe-area-inset-top,0px) + 5px);left:50%;transform:translateX(-50%);max-width:90vw;border:1px solid #d8d3eb;border-radius:20px;padding:5px 12px;background:#f0ecfa;color:#211c45;font:12px system-ui;box-shadow:0 2px 8px #211c4515}.cfh-offline-detail{border:0;border-radius:20px;padding:22px;max-width:min(90vw,440px);max-height:75dvh;background:#faf9ff;color:#211c45}.cfh-offline-detail::backdrop{background:#211c4560}.cfh-offline-detail button{border:1px solid #d8d3eb;border-radius:10px;padding:9px 13px;background:white;color:inherit;margin:4px}.cfh-offline-detail p{overflow-wrap:anywhere}.cfh-offline-detail section{border-top:1px solid #dedbea;padding:10px 0}`;document.head.append(style);
 const button=document.createElement('button');button.className='cfh-offline-status';button.type='button';button.hidden=true;button.setAttribute('aria-live','polite');
 const dialog=document.createElement('dialog');dialog.className='cfh-offline-detail';dialog.setAttribute('aria-label','Offline and sync status');document.body.append(button,dialog);
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 function details(){
  dialog.replaceChildren(el('h3',navigator.onLine===false?'Offline':'Sync status'),el('p','Saved changes stay on this device and upload when you reconnect. Live prices and announcements show the last saved data.'));
  for(const item of queue.items){const section=el('section','');section.append(el('strong',item.mutation?'Transaction change':item.installment?'Installment':'New transaction'),el('p',item.error||'Waiting to sync'));
   if(item.mutation){const r=item.mutation.record;section.append(el('p',[r.category,r.description,item.mutation.values?.amount??r.amount].filter(x=>x!==undefined&&x!==null&&x!=='').join(' · ')));if(item.mutation.values?.description)section.append(el('p',item.mutation.values.description));}
   if(item.error){const remove=el('button','Discard pending change');remove.type='button';remove.onclick=async()=>{if(!confirm('Discard this local change and any later pending edits to the same transaction? The saved server transaction will remain.'))return;remove.disabled=true;try{await queue.discard(item.key);details();}catch(error){alert(error.message);remove.disabled=false;}};section.append(remove);}dialog.append(section);
  }
  if(queue.error)dialog.append(el('p',queue.error));
  const retry=el('button','Retry sync');retry.type='button';retry.disabled=navigator.onLine===false||!!queue.busy;retry.onclick=()=>{void queue.flush();};const close=el('button','Close');close.type='button';close.onclick=()=>dialog.close();dialog.append(retry,close);
 }
 function render(){const offline=navigator.onLine===false,count=queue.items.length;button.hidden=!offline&&!count&&!queue.error;button.textContent=offline?'Offline'+(count?' · '+count+' pending':' · Saved data'):queue.error?'Sync needs attention':count+(queue.busy?' syncing…':' pending sync');if(dialog.open)details();}
 let previousOverflow;dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow||'';});
 button.onclick=()=>{details();previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();};dialog.onclick=event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}};
 queue.onChange(render);window.addEventListener('online',render);window.addEventListener('offline',render);render();
}
