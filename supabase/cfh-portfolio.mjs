import {stockLogos} from './cfh-stock-logos.mjs';
import {stockCompanies,DRAFT_TTL,recentPurchases,symbolMatches,activeDraft} from './cfh-portfolio-catalog.mjs';
import {portfolio,validateRecord,money,marketPhase} from './cfh-portfolio-model.mjs';
const OWNER='161ecab1-d1d7-4fef-a089-a7300b9da774',KEY='cfh-portfolio-v1:'+OWNER;
let state;try{state=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}state||={rows:[],pending:[]};state.rows||=[];state.pending||=[];
const DRAFT_KEY=KEY+':draft',BROKERS_KEY=KEY+':brokers';
let draft;try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');}catch{}
let asset='stock',client,busy=false,channel,refreshRequested=false,editingId=null;
const $=id=>document.getElementById(id),peso=v=>v===null?'—':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
function stockLogo(symbol){const img=document.createElement('img');img.className='cfh-stock-logo';img.alt=symbol+' logo';img.loading='lazy';img.width=40;img.height=40;const fallback='images/stocks/unknown.svg';img.src=stockLogos[symbol]||fallback;img.onerror=()=>{img.onerror=null;img.src=fallback;};return img;}
function persist(){localStorage.setItem(KEY,JSON.stringify(state));}
function status(value){if($('cfhPortfolioSync'))$('cfhPortfolioSync').textContent=value;}
function render(){
 if(!$('cfhPortfolioPage'))return;
 const p=portfolio(state.rows,asset),phase=marketPhase(new Date(),asset);
 $('cfhPortfolioMarket').textContent=phase.label;$('cfhPortfolioMarket').classList.toggle('is-open',phase.open);
 for(const [id,value]of [['cfhPortfolioBalance',p.balance],['cfhPortfolioInvested',p.invested],['cfhPortfolioCash',p.cashAvailable],['cfhPortfolioGain',p.gain]])$(id).textContent=peso(value);
 $('cfhPortfolioGain').className=p.gain<0?'is-loss':p.gain>0?'is-gain':'';
 $('cfhPortfolioGainPercent').textContent=p.percent===null?'':` (${p.percent.toFixed(2)}%)`;
 document.querySelectorAll('[data-portfolio-asset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.portfolioAsset===asset)));
 const table=$('cfhPortfolioHoldings');table.replaceChildren();
 if(!p.holdings.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent='No '+(asset==='stock'?'stocks':'crypto')+' recorded yet. Tap Invest to add your broker purchase.';table.append(empty);}
 for(const h of p.holdings){const row=document.createElement('button');row.type='button';row.className='cfh-portfolio-holding';row.setAttribute('aria-label','Record latest price for '+h.symbol);
 const name=document.createElement('span'),symbol=document.createElement('strong'),broker=document.createElement('small');symbol.textContent=h.symbol;broker.textContent=h.broker;const labels=document.createElement('span');labels.append(symbol,broker);name.className='cfh-holding-name';name.append(stockLogo(h.symbol),labels);
 const price=document.createElement('span'),value=document.createElement('strong'),qty=document.createElement('small');value.textContent=peso(h.price);qty.textContent=h.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' '+(asset==='stock'?'shares':'units');price.append(value,qty);
 const gain=document.createElement('span'),amount=document.createElement('strong'),percent=document.createElement('small');amount.textContent=peso(h.gain);amount.className=h.gain<0?'is-loss':h.gain>0?'is-gain':'';percent.textContent=h.percent===null?'Add latest price':h.percent.toFixed(2)+'%';gain.append(amount,percent);row.append(name,price,gain);row.onclick=()=>openValue('quote',h);table.append(row);}
 renderPurchases($('cfhPortfolioRecent'));
 window.syncActivePageHeight?.();
}
function close(id){if(id==='cfhPortfolioModal')saveDraft();$(id).hidden=true;document.querySelector('[data-cfh-dest="crypto"]')?.focus({preventScroll:true});}
function localSave(row){validateRecord(row);row.id=editingId||crypto.randomUUID();row.at=new Date().toISOString();const previous={rows:state.rows.slice(),pending:state.pending.slice()};
 if(!state.rows.some(r=>r.id===row.id)){state.rows.push(row);state.pending.push(row.id);}
 try{persist();}catch(e){state=previous;throw Error('Could not save on this device. Free some storage and try again.');}
 editingId=null;render();status('Saved on device · Sync pending');void sync();
}
function saveDraft(){const f=$('cfhPortfolioForm');draft={...Object.fromEntries(new FormData(f)),asset,expiresAt:Date.now()+DRAFT_TTL};try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch{}}
function clearDraft(){draft=null;try{localStorage.removeItem(DRAFT_KEY);}catch{}}
function populateBrokers(selected=''){const select=$('cfhPortfolioBroker');let custom=[];try{custom=JSON.parse(localStorage.getItem(BROKERS_KEY)||'[]');}catch{}const names=[...new Set(['DragonFi','DragonFi Lite (Maya)',...(Array.isArray(custom)?custom:[]),...state.rows.map(r=>r.broker),selected].filter(n=>typeof n==='string'&&n&&n!=='__add__'))];select.replaceChildren(new Option('Choose broker',''),...names.map(n=>new Option(n,n)),new Option('＋ Add broker','__add__'));select.value=selected;}
function hideSuggestions(){$('cfhPortfolioSuggestions').hidden=true;$('cfhPortfolioSymbol').setAttribute('aria-expanded','false');}
function showSuggestions(){const input=$('cfhPortfolioSymbol'),box=$('cfhPortfolioSuggestions');box.replaceChildren();for(const symbol of symbolMatches(input.value,state.rows,asset)){const button=document.createElement('button');button.type='button';button.role='option';const label=document.createElement('strong');label.textContent=symbol;const company=document.createElement('small');company.textContent=stockCompanies[symbol]||'';button.append(label,company);button.onclick=()=>{input.value=symbol;saveDraft();input.focus();hideSuggestions();};box.append(button);}box.hidden=!box.childElementCount;input.setAttribute('aria-expanded',String(!box.hidden));box.scrollTop=0;}
function openInvest(){const f=$('cfhPortfolioForm');f.reset();const saved=activeDraft(draft,asset);editingId=crypto.randomUUID();f.elements.asset.value=asset;populateBrokers(saved?.broker||'');const d=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));f.elements.date.value=d.year+'-'+d.month+'-'+d.day;if(saved)for(const name of ['date','symbol','shares','price','fees','notes'])f.elements[name].value=saved[name]||'';else clearDraft();f.elements.shares.step=asset==='stock'?'1':'any';$('cfhPortfolioAddBroker').hidden=true;$('cfhPortfolioNewBroker').value='';hideSuggestions();$('cfhPortfolioFormStatus').textContent='';updateTotal();$('cfhPortfolioModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function updateTotal(){const f=$('cfhPortfolioForm');const n=Number(f.elements.shares.value)*Number(f.elements.price.value)+Number(f.elements.fees.value||0);$('cfhPortfolioTotal').textContent=peso(money(n));}
function openValue(kind,h){editingId=crypto.randomUUID();const f=$('cfhPortfolioValueForm');f.reset();f.elements.kind.value=kind;f.elements.broker.value=h?.broker||'';f.elements.symbol.value=h?.symbol||'';f.elements.price.value=h?.price??'';f.elements.price.min='0';$('cfhPortfolioValueTitle').textContent=kind==='cash'?'Record broker cash':'Record latest price';$('cfhPortfolioValueSymbol').hidden=kind==='cash';$('cfhPortfolioValuePriceLabel').textContent=kind==='cash'?'Cash available at broker (₱)':'Latest price per share / unit (₱)';$('cfhPortfolioValueStatus').textContent='';$('cfhPortfolioValueModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function renderPurchases(box){
 box.replaceChildren();
 const rows=recentPurchases(state.rows,asset);
 for(const r of rows){const item=document.createElement('article');item.className='cfh-investment-card';const monogram=stockLogo(r.symbol);const details=document.createElement('div');details.className='cfh-investment-details';const title=document.createElement('strong');title.textContent=r.symbol;const buy=document.createElement('p');buy.className='cfh-investment-buy';buy.textContent='BUY @ '+peso(r.price)+' · '+r.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' '+(asset==='stock'?'shares':'units');details.append(title,buy);const badge=document.createElement('span');badge.className='cfh-investment-completed';badge.textContent='Completed';const meta=document.createElement('div');meta.className='cfh-investment-meta';const info=document.createElement('small');info.textContent=r.date+' · '+r.broker;const total=document.createElement('span');total.textContent='Fees '+peso(r.fees)+' · Total '+peso(money(r.shares*r.price+r.fees));meta.append(info,total);if(r.notes){const note=document.createElement('small');note.textContent=r.notes;meta.append(note);}item.append(monogram,details,badge,meta);box.append(item);}
 if(!rows.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent='No purchases recorded.';box.append(empty);}
}
function breakdown(){renderPurchases($('cfhPortfolioHistory'));$('cfhPortfolioHistoryModal').hidden=false;}
export function mountPortfolio(){
 if(!$('cfhPortfolioPage')||window.cfhPortfolioMounted)return;window.cfhPortfolioMounted=true;
 $('cfhPortfolioInvestButton').onclick=openInvest;$('cfhPortfolioBreakdown').onclick=breakdown;$('cfhPortfolioCashButton').onclick=()=>openValue('cash');
 for(const b of document.querySelectorAll('[data-portfolio-asset]'))b.onclick=()=>{asset=b.dataset.portfolioAsset;render();};
 for(const b of document.querySelectorAll('[data-portfolio-close]'))b.onclick=()=>close(b.dataset.portfolioClose);
 for(const id of ['cfhPortfolioModal','cfhPortfolioValueModal','cfhPortfolioHistoryModal']){$(id).onclick=e=>{if(e.target===$(id))close(id);};$(id).onkeydown=e=>{if(e.key==='Escape')close(id);if(e.key==='Tab'){const nodes=[...$(id).querySelectorAll('button,input,select,textarea')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};}
 $('cfhPortfolioForm').oninput=()=>{updateTotal();saveDraft();};
 $('cfhPortfolioBroker').onchange=()=>{const adding=$('cfhPortfolioBroker').value==='__add__';$('cfhPortfolioAddBroker').hidden=!adding;if(adding)$('cfhPortfolioNewBroker').focus();saveDraft();};
 $('cfhPortfolioAddBrokerButton').onclick=()=>{const name=$('cfhPortfolioNewBroker').value.trim();if(!name)return;populateBrokers(name);const names=[...$('cfhPortfolioBroker').options].map(o=>o.value).filter(v=>v&&v!=='__add__');try{localStorage.setItem(BROKERS_KEY,JSON.stringify(names));}catch{}$('cfhPortfolioAddBroker').hidden=true;saveDraft();};
 $('cfhPortfolioSymbol').addEventListener('input',showSuggestions);$('cfhPortfolioSymbol').onfocus=showSuggestions;
 $('cfhPortfolioSymbol').onkeydown=e=>{if(e.key==='ArrowDown'&&!$('cfhPortfolioSuggestions').hidden){e.preventDefault();$('cfhPortfolioSuggestions').firstElementChild?.focus();}if(e.key==='Escape'){e.stopPropagation();hideSuggestions();}};
 $('cfhPortfolioSuggestions').onkeydown=e=>{const buttons=[...$('cfhPortfolioSuggestions').children],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){e.stopPropagation();hideSuggestions();$('cfhPortfolioSymbol').focus();hideSuggestions();}};
 document.addEventListener('click',e=>{if(e.target!==$('cfhPortfolioSymbol')&&!$('cfhPortfolioSuggestions').contains(e.target))hideSuggestions();});
 window.addEventListener('pagehide',()=>{if(!$('cfhPortfolioModal').hidden)saveDraft();});
 $('cfhPortfolioForm').onsubmit=e=>{e.preventDefault();const f=e.target;try{if(!f.elements.broker.value||f.elements.broker.value==='__add__')throw Error('Choose or add a broker.');localSave({kind:'purchase',asset:f.elements.asset.value,broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),date:f.elements.date.value,shares:Number(f.elements.shares.value),price:Number(f.elements.price.value),fees:Number(f.elements.fees.value||0),notes:f.elements.notes.value.trim()});close('cfhPortfolioModal');clearDraft();f.reset();}catch(error){$('cfhPortfolioFormStatus').textContent=error.message;}};
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
