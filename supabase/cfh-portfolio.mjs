import {portfolio,validateRecord,money,marketPhase} from './cfh-portfolio-model.mjs';
const OWNER='161ecab1-d1d7-4fef-a089-a7300b9da774',KEY='cfh-portfolio-v1:'+OWNER;
let state;try{state=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}state||={rows:[],pending:[]};state.rows||=[];state.pending||=[];
let asset='stock',client,busy=false,channel,refreshRequested=false,editingId=null;
const $=id=>document.getElementById(id),peso=v=>v===null?'—':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
function persist(){localStorage.setItem(KEY,JSON.stringify(state));}
function status(value){if($('cfhPortfolioSync'))$('cfhPortfolioSync').textContent=value;}
function render(){
 if(!$('cfhPortfolioPage'))return;
 const p=portfolio(state.rows,asset),phase=marketPhase(new Date(),asset);
 $('cfhPortfolioMarket').textContent=phase.label;$('cfhPortfolioMarket').classList.toggle('is-open',phase.open);
 for(const [id,value]of [['cfhPortfolioBalance',p.balance],['cfhPortfolioInvested',p.invested],['cfhPortfolioCash',p.cashAvailable],['cfhPortfolioGain',p.gain]])$(id).textContent=peso(value);
 $('cfhPortfolioGain').className=p.gain<0?'is-loss':p.gain>0?'is-gain':'';
 $('cfhPortfolioGainPercent').textContent=p.percent===null?'':` (${p.percent.toFixed(2)}%)`;
 $('cfhPortfolioValuationNote').textContent=p.value===null?'Enter the latest price for each holding to calculate balance and gain / loss.':'Valuation uses your recorded prices, not a live market feed.';
 document.querySelectorAll('[data-portfolio-asset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.portfolioAsset===asset)));
 const table=$('cfhPortfolioHoldings');table.replaceChildren();
 if(!p.holdings.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent='No '+(asset==='stock'?'stocks':'crypto')+' recorded yet. Tap Invest to add your broker purchase.';table.append(empty);}
 for(const h of p.holdings){const row=document.createElement('button');row.type='button';row.className='cfh-portfolio-holding';row.setAttribute('aria-label','Record latest price for '+h.symbol);
 const name=document.createElement('span'),symbol=document.createElement('strong'),broker=document.createElement('small');symbol.textContent=h.symbol;broker.textContent=h.broker;name.append(symbol,broker);
 const price=document.createElement('span'),value=document.createElement('strong'),qty=document.createElement('small');value.textContent=peso(h.price);qty.textContent=h.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' '+(asset==='stock'?'shares':'units');price.append(value,qty);
 const gain=document.createElement('span'),amount=document.createElement('strong'),percent=document.createElement('small');amount.textContent=peso(h.gain);amount.className=h.gain<0?'is-loss':h.gain>0?'is-gain':'';percent.textContent=h.percent===null?'Add latest price':h.percent.toFixed(2)+'%';gain.append(amount,percent);row.append(name,price,gain);row.onclick=()=>openValue('quote',h);table.append(row);}
 $('cfhPortfolioPriceNote').textContent=asset==='stock'?'Market indicator follows regular PSE hours in Manila. Holidays, suspensions and special sessions may differ.':'Crypto trades around the clock; availability depends on your broker.';
 window.syncActivePageHeight?.();
}
function close(id){$(id).hidden=true;document.querySelector('[data-cfh-dest="crypto"]')?.focus({preventScroll:true});}
function localSave(row){validateRecord(row);row.id=editingId||crypto.randomUUID();row.at=new Date().toISOString();const previous={rows:state.rows.slice(),pending:state.pending.slice()};
 if(!state.rows.some(r=>r.id===row.id)){state.rows.push(row);state.pending.push(row.id);}
 try{persist();}catch(e){state=previous;throw Error('Could not save on this device. Free some storage and try again.');}
 editingId=null;render();status('Saved on device · Sync pending');void sync();
}
function openInvest(){editingId=crypto.randomUUID();const f=$('cfhPortfolioForm');f.reset();f.elements.asset.value=asset;const d=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));f.elements.date.value=d.year+'-'+d.month+'-'+d.day;f.elements.shares.step=asset==='stock'?'1':'any';$('cfhPortfolioFormStatus').textContent='';updateTotal();$('cfhPortfolioModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function updateTotal(){const f=$('cfhPortfolioForm');const n=Number(f.elements.shares.value)*Number(f.elements.price.value)+Number(f.elements.fees.value||0);$('cfhPortfolioTotal').textContent=peso(money(n));}
function openValue(kind,h){editingId=crypto.randomUUID();const f=$('cfhPortfolioValueForm');f.reset();f.elements.kind.value=kind;f.elements.broker.value=h?.broker||'';f.elements.symbol.value=h?.symbol||'';f.elements.price.value=h?.price??'';f.elements.price.min='0';$('cfhPortfolioValueTitle').textContent=kind==='cash'?'Record broker cash':'Record latest price';$('cfhPortfolioValueSymbol').hidden=kind==='cash';$('cfhPortfolioValuePriceLabel').textContent=kind==='cash'?'Cash available at broker (₱)':'Latest price per share / unit (₱)';$('cfhPortfolioValueStatus').textContent='';$('cfhPortfolioValueModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function breakdown(){const box=$('cfhPortfolioHistory');box.replaceChildren();const rows=state.rows.filter(r=>r.kind==='purchase'&&r.asset===asset).slice().reverse();
 for(const r of rows){const item=document.createElement('div');item.className='cfh-portfolio-history-row';const title=document.createElement('strong');title.textContent=r.symbol+' · '+r.broker;const detail=document.createElement('p');detail.textContent=r.date+' · '+r.shares+' × '+peso(r.price)+' · Fees '+peso(r.fees);const total=document.createElement('strong');total.textContent=peso(money(r.shares*r.price+r.fees));item.append(title,detail,total);box.append(item);}
 if(!rows.length)box.textContent='No purchases recorded.';$('cfhPortfolioHistoryModal').hidden=false;}
export function mountPortfolio(){
 if(!$('cfhPortfolioPage')||window.cfhPortfolioMounted)return;window.cfhPortfolioMounted=true;
 $('cfhPortfolioInvestButton').onclick=openInvest;$('cfhPortfolioBreakdown').onclick=breakdown;$('cfhPortfolioCashButton').onclick=()=>openValue('cash');
 for(const b of document.querySelectorAll('[data-portfolio-asset]'))b.onclick=()=>{asset=b.dataset.portfolioAsset;render();};
 for(const b of document.querySelectorAll('[data-portfolio-close]'))b.onclick=()=>close(b.dataset.portfolioClose);
 for(const id of ['cfhPortfolioModal','cfhPortfolioValueModal','cfhPortfolioHistoryModal']){$(id).onclick=e=>{if(e.target===$(id))close(id);};$(id).onkeydown=e=>{if(e.key==='Escape')close(id);if(e.key==='Tab'){const nodes=[...$(id).querySelectorAll('button,input,select,textarea')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};}
 $('cfhPortfolioForm').oninput=updateTotal;
 $('cfhPortfolioForm').onsubmit=e=>{e.preventDefault();const f=e.target;try{localSave({kind:'purchase',asset:f.elements.asset.value,broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),date:f.elements.date.value,shares:Number(f.elements.shares.value),price:Number(f.elements.price.value),fees:Number(f.elements.fees.value||0),notes:f.elements.notes.value.trim()});close('cfhPortfolioModal');}catch(error){$('cfhPortfolioFormStatus').textContent=error.message;}};
 $('cfhPortfolioValueForm').onsubmit=e=>{e.preventDefault();const f=e.target;try{localSave({kind:f.elements.kind.value,asset,broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),price:Number(f.elements.price.value)});close('cfhPortfolioValueModal');}catch(error){$('cfhPortfolioValueStatus').textContent=error.message;}};
 window.cfhPortfolioRender=()=>{render();if(client)void sync();};render();status(state.pending.length?'Saved on device · Sync pending':'Connecting portfolio sync…');
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('cfh-crypto-active'))render();});
}
async function sync(){
 if(!client||busy||!navigator.onLine){if(state.pending.length)status('Saved on device · Sync pending');return;}busy=true;
 try{
  for(const id of state.pending.slice()){const row=state.rows.find(r=>r.id===id);if(!row)continue;const {error}=await client.from('cfh_portfolio_records').insert({owner_id:OWNER,id,payload:row});if(error&&error.code!=='23505')throw error;state.pending=state.pending.filter(x=>x!==id);persist();}
  const remote=[];for(let start=0;;start+=500){const {data,error}=await client.from('cfh_portfolio_records').select('id,payload').eq('owner_id',OWNER).order('created_at',{ascending:true}).order('id',{ascending:true}).range(start,start+499);if(error)throw error;remote.push(...data);if(data.length<500)break;}
  const map=new Map(state.rows.map(r=>[r.id,r]));for(const r of remote){try{validateRecord(r.payload);map.set(r.id,{...r.payload,id:r.id});}catch{}}
  state.rows=[...map.values()];persist();render();status(state.pending.length?'Saved on device · Sync pending':'Portfolio synced');
 }catch(error){status('Saved on device · Sync pending. Reconnect to retry.');console.warn('Portfolio sync:',error.message);}finally{busy=false;if(refreshRequested){refreshRequested=false;void sync();}}
}
export function startPortfolioSync(c,owner){if(owner!==OWNER)throw Error('Portfolio account mismatch');if(client)return;client=c;mountPortfolio();void sync();
 const connect=()=>{if(document.hidden||!navigator.onLine||channel)return;channel=client.channel('cfh-portfolio:'+OWNER).on('postgres_changes',{event:'INSERT',schema:'public',table:'cfh_portfolio_records',filter:'owner_id=eq.'+OWNER},()=>{if(busy)refreshRequested=true;else void sync();}).subscribe(s=>{if(s==='SUBSCRIBED')void sync();});};
 const disconnect=()=>{if(channel){void client.removeChannel(channel);channel=null;}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disconnect();else{connect();void sync();}});window.addEventListener('online',()=>{connect();void sync();});window.addEventListener('offline',disconnect);window.addEventListener('pagehide',disconnect);window.addEventListener('pageshow',()=>{connect();void sync();});connect();
}
mountPortfolio();
