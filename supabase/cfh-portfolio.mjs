import {mountCryptoNav} from './cfh-crypto-nav.mjs';
import {holdingSortChoices,validHoldingSort,sortHoldings} from './cfh-portfolio-sort.mjs';
import {resolvePurchaseFees} from './cfh-portfolio-fees.mjs';
import {stockLogos} from './cfh-stock-logos.mjs';
import {stockCompanies,DRAFT_TTL,recentPurchases,symbolMatches,activeDraft,purchaseDateLabel} from './cfh-portfolio-catalog.mjs';
import {portfolio,validateRecord,money,marketPhase} from './cfh-portfolio-model.mjs';
import {parsePseStocksResponse,liveStockQuoteRows} from './cfh-stock-prices.mjs';
const OWNER='161ecab1-d1d7-4fef-a089-a7300b9da774',KEY='cfh-portfolio-v1:'+OWNER;
let state;try{state=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}state||={rows:[],pending:[]};state.rows||=[];state.pending||=[];
const DRAFT_KEY=KEY+':draft',BROKERS_KEY=KEY+':brokers',STOCK_PRICES_KEY=KEY+':stock-prices';
let feeMode='auto',balanceBroker='',balancesHidden=false,balancePortfolio=null,balanceCloseTimer=null;
let holdingSort='symbol';
let draft;try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');}catch{}
let asset='stock',client,busy=false,channel,refreshRequested=false,editingId=null,portfolioView='portfolio',dividendStatus='upcoming',snapshotTrigger=null;
let liveStockPrices=new Map(),lastStockPriceAt=null,livePriceTimer=null,livePriceBusy=false,snapshotScrollY=0;
try{const saved=JSON.parse(localStorage.getItem(STOCK_PRICES_KEY)||'null');if(saved&&Number.isFinite(Date.parse(saved.fetched_at))){liveStockPrices=parsePseStocksResponse(saved);lastStockPriceAt=saved.fetched_at;}}catch{}
function stockPriceStatus(now=new Date()){
 const phase=marketPhase(now,'stock');
 const label=phase.open?'Last prices':phase.label.startsWith('Market recess')?'Market recess':'Market closed';
 if(!liveStockPrices.size||!lastStockPriceAt)return phase.open?'Waiting for live PSE prices…':label+' · No saved prices yet';
 const updated=new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(new Date(lastStockPriceAt));
 return label+' · Last updated '+updated;
}
function saveStockPrices(data){
 const prices=parsePseStocksResponse(data);
 if(!prices.size)throw Error('No stock prices returned; keeping last update.');
 const at=Number.isFinite(Date.parse(data?.fetched_at))?data.fetched_at:new Date().toISOString();
 for(const [symbol,quote]of prices)liveStockPrices.set(symbol,{...quote,at:quote.at||at});
 lastStockPriceAt=at;
 try{localStorage.setItem(STOCK_PRICES_KEY,JSON.stringify({fetched_at:at,stocks:[...liveStockPrices.values()].map(q=>({symbol:q.symbol,price:q.price,as_of:q.at}))}));}catch(error){console.warn('Could not save stock prices on this device:',error.message);}
}
const $=id=>document.getElementById(id),peso=v=>v===null?'—':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
function stockLogo(symbol){const img=document.createElement('img');img.className='cfh-stock-logo';img.alt=symbol+' logo';img.loading='lazy';img.width=40;img.height=40;const fallback='images/stocks/unknown.svg';img.src=stockLogos[symbol]||fallback;img.onerror=()=>{img.onerror=null;img.src=fallback;};return img;}
function openHoldingSnapshot(h,trigger){
 const modal=$('cfhHoldingSnapshotModal');snapshotTrigger=trigger;modal.hidden=true;
 const brokerName=h.broker||'Broker',isDragonFi=brokerName.trim().toLowerCase()==='dragonfi';
 const brokerLabel=$('cfhStockSnapshotBroker'),brokerLogo=$('cfhStockSnapshotBrokerLogo');
 brokerLabel.textContent=brokerName;brokerLabel.hidden=isDragonFi;
 if(brokerLogo)brokerLogo.hidden=!isDragonFi;
 $('cfhStockSnapshotSymbol').textContent=h.symbol;
 const oldStockLogo=$('cfhStockSnapshotLogo'),nextStockLogo=stockLogo(h.symbol);
 nextStockLogo.id='cfhStockSnapshotLogo';oldStockLogo.replaceWith(nextStockLogo);
 $('cfhStockSnapshotGain').textContent=peso(h.gain);
 $('cfhStockSnapshotPercent').textContent=h.percent===null?'—':h.percent.toFixed(2)+'%';
 const changeClass=h.gain<0?'is-loss':h.gain>0?'is-gain':'';
 $('cfhStockSnapshotGain').className=changeClass;
 $('cfhStockSnapshotPercent').className=changeClass;
 $('cfhStockSnapshotMarketValue').textContent=h.value===null?'—':peso(h.value);
 $('cfhStockSnapshotShares').textContent=h.shares.toLocaleString('en-PH',{maximumFractionDigits:8});
 $('cfhStockSnapshotMarketPrice').textContent=h.price===null?'—':peso(h.price);
 $('cfhStockSnapshotAverageCost').textContent=h.shares?peso(h.cost/h.shares):'—';
 modal.setAttribute('aria-label','Stock snapshot for '+h.symbol);
 if(!document.body.classList.contains('cfh-stock-snapshot-open')){
  snapshotScrollY=window.scrollY||window.pageYOffset||0;
  document.body.dataset.cfhSnapshotScrollY=String(snapshotScrollY);
  document.body.style.position='fixed';document.body.style.top=(-snapshotScrollY)+'px';
  document.body.style.left='0';document.body.style.right='0';document.body.style.width='100%';
 }
 document.body.classList.add('cfh-stock-snapshot-open');
 modal.hidden=false;
 modal.querySelector('[data-portfolio-close="cfhHoldingSnapshotModal"]')?.focus({preventScroll:true});
}
function persist(){localStorage.setItem(KEY,JSON.stringify(state));}
function status(value){if($('cfhPortfolioSync'))$('cfhPortfolioSync').textContent=value;}
let balanceWalletTemplate=null;
function brokerLogoNode(name){
 if(!balanceWalletTemplate)balanceWalletTemplate=document.querySelector('.cfh-balance-profile .cfh-balance-logo svg').cloneNode(true);
 if(/^(DragonFi|COL)/i.test(name)){const img=document.createElement('img');img.src=/^COL/i.test(name)?'images/stocks/COL.jpg':'images/dragonfi-symbol.svg';img.alt='';return img;}
 if(!name)return balanceWalletTemplate.cloneNode(true);
 const text=document.createElement('span');text.textContent=name.slice(0,2).toUpperCase();return text;
}
function brokerTheme(name){return /^COL(?: Financial)?$/i.test(name.trim())?'col':/^DragonFi Lite/i.test(name.trim())?'lite':/^DragonFi$/i.test(name.trim())?'dragonfi':'all';}
function render(){
 if(!$('cfhPortfolioPage'))return;
 const base=portfolio(state.rows,asset),phase=marketPhase(new Date(),asset);
 const liveRows=asset==='stock'?liveStockQuoteRows(base.holdings,liveStockPrices,lastStockPriceAt||new Date().toISOString()):[];
 const allRows=liveRows.length?[...state.rows,...liveRows]:state.rows;
 const p=portfolio(balanceBroker?allRows.filter(r=>r.broker===balanceBroker):allRows,asset);balancePortfolio=p;
 $('cfhBalanceBroker').textContent=balanceBroker||'All Brokers';
 document.querySelector('.cfh-balance-card').dataset.brokerTheme=brokerTheme(balanceBroker);
 document.querySelector('.cfh-balance-profile .cfh-balance-logo').replaceChildren(brokerLogoNode(balanceBroker));
 if(asset==='stock'&&$('cfhMarketPriceStatus'))$('cfhMarketPriceStatus').textContent=stockPriceStatus();
 $('cfhPortfolioMarket').textContent=phase.label;$('cfhPortfolioMarket').classList.toggle('is-open',phase.open);
 for(const [id,value]of [['cfhPortfolioBalance',p.balance],['cfhPortfolioInvested',p.invested],['cfhPortfolioGain',p.gain]])$(id).textContent=balancesHidden?'••••':peso(value);
 $('cfhPortfolioGain').className=p.gain<0?'is-loss':p.gain>0?'is-gain':'';
 $('cfhPortfolioGain').parentElement.className=p.gain<0?'is-loss':p.gain>0?'is-gain':'';
 $('cfhPortfolioGainPercent').textContent=balancesHidden||p.percent===null?'':` (${p.percent.toFixed(2)}%)`;
 document.querySelectorAll('[data-portfolio-asset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.portfolioAsset===asset)));
 $('cfhHoldingSortLabel').hidden=asset!=='stock';if(asset!=='stock'){$('cfhHoldingSortMenu').hidden=true;$('cfhHoldingSort').setAttribute('aria-expanded','false');}
 const table=$('cfhPortfolioHoldings');table.replaceChildren();
 if(!p.holdings.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent='No '+(asset==='stock'?'stocks':'crypto')+' recorded yet. Tap Invest to add your broker purchase.';table.append(empty);}
 let previousBroker=null;
 for(const h of asset==='stock'?sortHoldings(p.holdings,holdingSort,state.rows):p.holdings){
 if(asset==='stock'&&holdingSort==='broker'&&h.broker!==previousBroker){const heading=document.createElement('h3');heading.className='cfh-broker-partition';heading.textContent=h.broker;table.append(heading);previousBroker=h.broker;}
 const item=document.createElement('div');item.className='cfh-holding-item';
 const row=document.createElement('div');row.className='cfh-portfolio-holding';row.setAttribute('role','group');row.setAttribute('aria-label','Stock holding: '+h.symbol);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='cfh-holding-toggle';toggle.textContent='›';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show details for '+h.symbol);
 const name=document.createElement('span'),symbol=document.createElement('strong'),broker=document.createElement('small');symbol.textContent=h.symbol;broker.textContent=h.broker;const labels=document.createElement('span');labels.append(symbol,broker);name.className='cfh-holding-name';name.append(stockLogo(h.symbol),labels);
 const price=document.createElement('span'),value=document.createElement('strong'),qty=document.createElement('small');value.textContent=peso(h.price);qty.textContent=h.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' '+(asset==='stock'?'shares':'units');price.append(value,qty);
 const gain=document.createElement('span'),amount=document.createElement('strong'),percent=document.createElement('small');amount.textContent=peso(h.gain);amount.className=h.gain<0?'is-loss':h.gain>0?'is-gain':'';percent.textContent=h.percent===null?'Quote unavailable':h.percent.toFixed(2)+'%';gain.append(amount,percent);
 const external=document.createElement('button');external.type='button';external.className='cfh-holding-external';external.setAttribute('aria-label',(asset==='stock'?'View':'Search')+' '+h.symbol+(asset==='stock'?' stock snapshot':' price'));external.title=asset==='stock'?'View stock snapshot':'Search quote on the web';external.dataset.holdingSymbol=h.symbol;external.innerHTML='<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M10 3h5v5M15 3 8 10M13 10v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/></svg>';external.addEventListener('click',()=>{if(asset==='stock'){openHoldingSnapshot(h,external);return;}window.open('https://www.google.com/search?q='+encodeURIComponent(h.symbol+' crypto price'),'_blank','noopener,noreferrer');});
 row.append(toggle,name,price,gain,external);
 const details=document.createElement('div');details.className='cfh-holding-details';details.hidden=true;
 function detailLine(labelText,valueText,helpText){
  const line=document.createElement('div');line.className='cfh-holding-detail-row';
  const label=document.createElement('span');label.className='cfh-holding-detail-label';label.append(document.createTextNode(labelText));
  const info=document.createElement('button');info.type='button';info.className='cfh-holding-info';info.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="m8.93 6.588-2.29.29-.082.38.45.082c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>';info.setAttribute('aria-label','Show information about '+labelText);info.setAttribute('aria-expanded','false');
  const tip=document.createElement('span');tip.className='cfh-holding-info-tip';tip.hidden=true;tip.textContent=helpText;
  info.addEventListener('click',event=>{event.stopPropagation();const show=tip.hidden;table.querySelectorAll('.cfh-holding-info-tip').forEach(el=>el.hidden=true);table.querySelectorAll('.cfh-holding-info').forEach(el=>el.setAttribute('aria-expanded','false'));tip.hidden=!show;info.setAttribute('aria-expanded',String(show));});
  label.append(info,tip);
  const val=document.createElement('strong');val.className='cfh-holding-detail-value';val.textContent=valueText;
  line.append(label,val);details.append(line);
 }
 detailLine('Market Value',h.value===null?'—':peso(h.value),h.sellingFees>0?'Price × quantity, less estimated selling charges of '+peso(h.sellingFees)+'. Applies to COL Financial, DragonFi and DragonFi Lite.':'Current value of your stock position (price × quantity).');
 detailLine('Avg Cost',h.shares?peso(h.cost/h.shares):'—','Volume weighted average execution price. Purchase fees are included.');
 function toggleDetails(){
  details.hidden=!details.hidden;item.classList.toggle('is-expanded',!details.hidden);toggle.textContent=details.hidden?'›':'⌄';toggle.setAttribute('aria-expanded',String(!details.hidden));toggle.setAttribute('aria-label',(details.hidden?'Show':'Hide')+' details for '+h.symbol);window.syncActivePageHeight?.();
 }
 item.tabIndex=0;item.setAttribute('aria-label','Toggle details for '+h.symbol);
 item.addEventListener('click',event=>{if(event.target.closest('.cfh-holding-name, .cfh-holding-external'))return;toggleDetails();});
 item.addEventListener('keydown',event=>{if(event.target!==item)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDetails();}});
 toggle.addEventListener('click',event=>{event.stopPropagation();toggleDetails();});
 item.append(row,details);table.append(item);
}
 renderHistoryView();
 window.syncActivePageHeight?.();
}
let investmentScrollLock=null;
function lockInvestmentBackground(){if(investmentScrollLock)return;investmentScrollLock={y:window.scrollY,style:document.body.getAttribute('style')};document.body.classList.add('cfh-investment-open');Object.assign(document.body.style,{position:'fixed',top:`-${investmentScrollLock.y}px`,left:'0',right:'0',width:'100%'});}
function unlockInvestmentBackground(){if(!investmentScrollLock)return;const {y,style}=investmentScrollLock;investmentScrollLock=null;document.body.classList.remove('cfh-investment-open');if(style===null)document.body.removeAttribute('style');else document.body.setAttribute('style',style);window.scrollTo(0,y);}
function close(id){if(id==='cfhBalanceModal'){const modal=$(id);if(modal.hidden||balanceCloseTimer)return;modal.classList.add('is-closing');balanceCloseTimer=setTimeout(()=>{modal.hidden=true;modal.classList.remove('is-closing');balanceCloseTimer=null;unlockInvestmentBackground();$('cfhBalanceSwitch').focus({preventScroll:true});},220);return;}if(id==='cfhHoldingSnapshotModal'){const modal=$(id);if(modal.hidden)return;modal.hidden=true;document.body.classList.remove('cfh-stock-snapshot-open');const y=Number(document.body.dataset.cfhSnapshotScrollY||snapshotScrollY||0);document.body.style.position='';document.body.style.top='';document.body.style.left='';document.body.style.right='';document.body.style.width='';delete document.body.dataset.cfhSnapshotScrollY;snapshotScrollY=0;const trigger=snapshotTrigger;snapshotTrigger=null;window.scrollTo(0,y);const symbol=modal.getAttribute('aria-label')?.replace(/^Stock snapshot for /,'');const current=[...document.querySelectorAll('.cfh-holding-external')].find(button=>button.dataset.holdingSymbol===symbol)||trigger;if(current?.isConnected)current.focus({preventScroll:true});return;}if(id==='cfhPortfolioModal')saveDraft();if(['cfhPortfolioModal','cfhBalanceModal','cfhPortfolioValueModal'].includes(id))unlockInvestmentBackground();$(id).hidden=true;document.querySelector('[data-cfh-dest="crypto"]')?.focus({preventScroll:true});}
function localSave(row){validateRecord(row);row.id=editingId||crypto.randomUUID();if(row.kind==='dividend'&&!row.recordId)row.recordId=row.id;row.at=new Date().toISOString();const previous={rows:state.rows.slice(),pending:state.pending.slice()};
 if(!state.rows.some(r=>r.id===row.id)){state.rows.push(row);state.pending.push(row.id);}
 try{persist();}catch(e){state=previous;throw Error('Could not save on this device. Free some storage and try again.');}
 editingId=null;render();status('Saved on device · Sync pending');void sync();
}
function saveDraft(){const f=$('cfhPortfolioForm');draft={...Object.fromEntries(new FormData(f)),asset,feeMode,expiresAt:Date.now()+DRAFT_TTL};try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch{}}
function clearDraft(){draft=null;try{localStorage.removeItem(DRAFT_KEY);}catch{}}
function populateBrokers(selected=''){const select=$('cfhPortfolioBroker');let custom=[];try{custom=JSON.parse(localStorage.getItem(BROKERS_KEY)||'[]');}catch{}const names=[...new Set(['COL Financial','DragonFi','DragonFi Lite (Maya)',...(Array.isArray(custom)?custom:[]),...state.rows.map(r=>r.broker),selected].filter(n=>typeof n==='string'&&n&&n!=='__add__'))];select.replaceChildren(new Option('Choose broker',''),...names.map(n=>new Option(n,n)),new Option('＋ Add broker','__add__'));select.value=selected;}
function hideSuggestions(){$('cfhPortfolioSuggestions').hidden=true;$('cfhPortfolioSymbol').setAttribute('aria-expanded','false');}
function showSuggestions(){const input=$('cfhPortfolioSymbol'),box=$('cfhPortfolioSuggestions');box.replaceChildren();for(const symbol of symbolMatches(input.value,state.rows,asset)){const button=document.createElement('button');button.type='button';button.role='option';const label=document.createElement('strong');label.textContent=symbol;const company=document.createElement('small');company.textContent=stockCompanies[symbol]||'';button.append(label,company);button.onclick=()=>{input.value=symbol;saveDraft();input.focus();hideSuggestions();};box.append(button);}box.hidden=!box.childElementCount;input.setAttribute('aria-expanded',String(!box.hidden));box.scrollTop=0;}
function openInvest(){const f=$('cfhPortfolioForm');f.reset();const saved=activeDraft(draft,asset);editingId=crypto.randomUUID();f.elements.asset.value=asset;populateBrokers(saved?.broker||'');const d=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));f.elements.date.value=d.year+'-'+d.month+'-'+d.day;if(saved)for(const name of ['date','symbol','shares','price','fees','notes','purchaseType'])f.elements[name].value=saved[name]||(name==='purchaseType'?'market':'');else clearDraft();feeMode=saved?(saved.feeMode||(saved.fees!==''?'manual':'auto')):'auto';$('cfhPurchaseTypeLabel').hidden=asset!=='stock';f.elements.shares.step='any';$('cfhPortfolioAddBroker').hidden=true;$('cfhPortfolioNewBroker').value='';hideSuggestions();$('cfhPortfolioFormStatus').textContent='';updateTotal();lockInvestmentBackground();$('cfhPortfolioModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function updateTotal(){const f=$('cfhPortfolioForm');$('cfhPurchaseDateText').textContent=purchaseDateLabel(f.elements.date.value);const resolved=resolvePurchaseFees({asset,broker:f.elements.broker.value,date:f.elements.date.value,shares:f.elements.shares.value,price:f.elements.price.value,purchaseType:f.elements.purchaseType.value},feeMode,f.elements.fees.value);f.elements.fees.value=resolved.value;$('cfhFeeLabel').textContent=feeMode==='manual'?'Invoice fees (₱)':'Estimated fees (₱)';$('cfhFeeHelp').textContent=feeMode==='manual'?'Using your invoice fee. It stays unchanged when purchase details change.':resolved.estimate.message;$('cfhUseFeeEstimate').hidden=feeMode!=='manual'||resolved.estimate.amount===null;const n=Number(f.elements.shares.value)*Number(f.elements.price.value)+Number(f.elements.fees.value||0);$('cfhPortfolioTotal').textContent=peso(money(n));}
function openValue(kind,h){editingId=crypto.randomUUID();const f=$('cfhPortfolioValueForm');f.reset();f.elements.kind.value=kind;f.elements.broker.value=h?.broker||'';f.elements.symbol.value=h?.symbol||'';f.elements.price.value=h?.price??'';f.elements.price.min='0';$('cfhPortfolioValueTitle').textContent=kind==='cash'?'Manage Money':'Record latest price';$('cfhPortfolioValueSymbol').hidden=kind==='cash';$('cfhPortfolioValuePriceLabel').textContent=kind==='cash'?'Cash available at broker (₱)':'Latest price per share / unit (₱)';$('cfhPortfolioValueStatus').textContent='';lockInvestmentBackground();$('cfhPortfolioValueModal').hidden=false;f.elements.broker.focus({preventScroll:true});}
function renderPurchases(box){
 box.replaceChildren();
 const rows=recentPurchases(state.rows,asset);
 for(const r of rows){const item=document.createElement('article');item.className='cfh-investment-card';const monogram=stockLogo(r.symbol);const details=document.createElement('div');details.className='cfh-investment-details';const title=document.createElement('strong');title.className='cfh-investment-title';title.textContent=r.symbol;const broker=document.createElement('span');broker.className='cfh-investment-broker';broker.textContent=' · '+r.broker;title.append(broker);const buy=document.createElement('p');buy.className='cfh-investment-buy';const side=document.createElement('span');side.className='cfh-investment-side';side.textContent='BUY';buy.append(side,document.createTextNode(' @ '+peso(r.price)+' · '+r.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' '+(asset==='stock'?'shares':'units')));details.append(title,buy);const badge=document.createElement('span');badge.className='cfh-investment-completed';badge.textContent='Completed';const meta=document.createElement('div');meta.className='cfh-investment-meta';const info=document.createElement('time');info.dateTime=r.date;info.textContent=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(r.date+'T12:00:00Z'));const total=document.createElement('span');total.textContent='Fees '+peso(r.fees)+' · Total '+peso(money(r.shares*r.price+r.fees));const summary=document.createElement('div');summary.className='cfh-investment-summary';summary.append(info,document.createTextNode(' · '),total);meta.append(summary);if(r.notes){const note=document.createElement('small');note.textContent=r.notes;meta.append(note);}item.append(monogram,details,badge,meta);box.append(item);}
 if(!rows.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent='No purchases recorded.';box.append(empty);}
}
function manilaToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function currentDividends(){
 const map=new Map();
 for(const row of state.rows.filter(r=>r.kind==='dividend'&&r.asset==='stock')){
  const key=row.recordId||row.id,prev=map.get(key);
  if(!prev||String(row.at||'').localeCompare(String(prev.at||''))>0)map.set(key,row);
 }
 return [...map.values()];
}
function renderDividends(){
 const box=$('cfhPortfolioDividendList');if(!box)return;box.replaceChildren();
 const rows=currentDividends().filter(r=>r.status===dividendStatus).sort((a,b)=>dividendStatus==='upcoming'?a.paymentDate.localeCompare(b.paymentDate):b.paymentDate.localeCompare(a.paymentDate));
 for(const r of rows){
  const item=document.createElement('details');item.className='cfh-dividend-card';
  const header=document.createElement('summary');header.className='cfh-dividend-header';
  const arrow=document.createElement('span');arrow.className='cfh-dividend-chevron';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
  const details=document.createElement('div');details.className='cfh-dividend-heading';
  const identity=document.createElement('div');identity.className='cfh-dividend-identity';
  const title=document.createElement('strong');title.textContent=r.symbol;identity.append(stockLogo(r.symbol),title);
  const broker=document.createElement('span');broker.className='cfh-dividend-broker';broker.textContent=r.broker;
  const chips=document.createElement('div');chips.className='cfh-dividend-chips';
  const qty=document.createElement('span');qty.textContent=r.shares.toLocaleString('en-PH',{maximumFractionDigits:8})+' Qty';
  const rate=document.createElement('span');rate.textContent=peso(r.displayedRate??r.perShare)+' Dividend';chips.append(qty,rate);identity.append(broker);details.append(identity,chips);
  const amount=document.createElement('strong');amount.className='cfh-dividend-total';amount.textContent=peso(money(r.shares*r.perShare-r.tax));header.append(arrow,details,amount);
  const body=document.createElement('div');body.className='cfh-dividend-body';
  const formatDate=value=>value?new Intl.DateTimeFormat('en-US',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
  for(const [label,value] of [['Gross Amount',peso(r.grossAmount??r.shares*r.perShare)],['Quantity',r.shares.toLocaleString('en-PH',{maximumFractionDigits:8})],['Dividend Rate',peso(r.displayedRate??r.perShare)],['Ex-Date',formatDate(r.exDate)],['Payment Date',formatDate(r.status==='paid'?(r.paidDate||r.paymentDate):r.paymentDate)]]){
   const row=document.createElement('div');row.className='cfh-dividend-detail-row';const key=document.createElement('span');key.textContent=label;const val=document.createElement('span');val.textContent=value;row.append(key,val);body.append(row);
  }
  item.append(header,body);
  if(dividendStatus==='upcoming'){const paid=document.createElement('button');paid.type='button';paid.className='cfh-dividend-mark-paid';paid.textContent='Mark as paid';paid.onclick=()=>{editingId=crypto.randomUUID();localSave({...r,id:editingId,recordId:r.recordId||r.id,status:'paid',paidDate:manilaToday()});renderHistoryView();};body.append(paid);}
  box.append(item);
 }
 if(!rows.length){const empty=document.createElement('p');empty.className='cfh-portfolio-empty';empty.textContent=dividendStatus==='paid'?'No paid dividends recorded yet.':'No upcoming dividends recorded yet.';box.append(empty);}
}
function renderHistoryView(){
 const page=$('cfhPortfolioHistoryView');if(!page)return;
 for(const id of ['cfhPortfolioMarket','cfhMarketPriceStatus']){const node=$(id);if(node)node.hidden=portfolioView!=='portfolio';}
 page.hidden=portfolioView==='portfolio';
 const dashboard=$('cfhPortfolioDashboard');if(dashboard)dashboard.hidden=portfolioView!=='portfolio';
 const title=$('cfhPortfolioTitle');if(title)title.textContent=portfolioView==='dividends'?'Dividend History':portfolioView==='history'?'History':'Portfolio';
 document.querySelectorAll('[data-portfolio-page]').forEach(b=>{const selected=b.dataset.portfolioPage===portfolioView;b.setAttribute('aria-pressed',String(selected));if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const tx=$('cfhPortfolioTransactions'),divs=$('cfhPortfolioDividendSection');
 if(tx)tx.hidden=portfolioView!=='history';
 if(divs)divs.hidden=portfolioView!=='dividends';
 document.querySelectorAll('[data-dividend-status]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dividendStatus===dividendStatus)));
 const statusTabs=$('cfhPortfolioDividendStatuses');if(statusTabs)statusTabs.hidden=portfolioView!=='dividends';
 renderPurchases($('cfhPortfolioTransactions'));
 renderDividends();
}
function selectPortfolioView(view){portfolioView=view;renderHistoryView();window.syncActivePageHeight?.();}
function openBalancePanel(title){clearTimeout(balanceCloseTimer);balanceCloseTimer=null;$('cfhBalanceModal').classList.remove('is-closing');const panel=$('cfhBalanceModal');panel.classList.toggle('is-breakdown',title==='Investment Breakdown');if(title==='Investment Breakdown')panel.dataset.brokerTheme=brokerTheme(balanceBroker);else delete panel.dataset.brokerTheme;$('cfhBalanceModalTitle').textContent=title;const heading=$('cfhBalanceModalTitle').parentElement;heading.hidden=!title;const dialog=$('cfhBalanceModal').querySelector('[role=dialog]');if(title){dialog.setAttribute('aria-labelledby','cfhBalanceModalTitle');dialog.removeAttribute('aria-label');}else{dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','Choose broker');}$('cfhBalanceModalContent').replaceChildren();lockInvestmentBackground();$('cfhBalanceModal').hidden=false;$('cfhBalanceModal').querySelector('button').focus({preventScroll:true});return $('cfhBalanceModalContent');}
function breakdown(){
 const box=openBalancePanel('Investment Breakdown'),p=balancePortfolio;
 const top=document.createElement('div');top.className='cfh-breakdown-assets';
 const chart=document.createElement('div');chart.className='cfh-breakdown-donut';chart.setAttribute('role','img');chart.setAttribute('aria-label',balancesHidden?'Balances hidden':'Recorded '+(asset==='stock'?'stocks':'crypto')+' and cash allocation');
 const total=p.value===null?null:p.value+p.cashAvailable;
 if(!balancesHidden&&total>0&&p.value>=0&&p.cashAvailable>=0){const share=p.value/total*100;chart.style.background=`conic-gradient(#dfce00 0% ${share}%,#00a779 ${share}% 100%)`;}
 top.append(chart);
 const legend=document.createElement('div');legend.className='cfh-breakdown-legend';
 for(const [label,value,kind] of [[asset==='stock'?'Stocks':'Crypto',p.value,'assets'],['Cash',p.cashAvailable,'cash'],['Funds',null,'funds']]){const row=document.createElement('div');row.className='cfh-breakdown-row';const name=document.createElement('span'),dot=document.createElement('i'),amount=document.createElement('strong');dot.className='cfh-breakdown-dot '+kind;name.append(dot,document.createTextNode(label));amount.textContent=balancesHidden?'••••':peso(value);row.append(name,amount);legend.append(row);}top.append(legend);box.append(top);
 const availability=document.createElement('div');availability.className='cfh-breakdown-availability';for(const label of ['Available to Trade','Available to Withdraw']){const cell=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent=balancesHidden?'••••':'—';cell.append(name,value);availability.append(cell);}box.append(availability);
}

function switchBalanceBroker(){
 const box=openBalancePanel(''),names=[...new Set(state.rows.filter(r=>r.asset===asset).map(r=>r.broker).filter(Boolean))].sort();
 const order=[balanceBroker,...['',...names].filter(name=>name!==balanceBroker)];
 for(const [i,name] of order.entries()){
  if(i===1){const divider=document.createElement('div');divider.className='cfh-broker-choice-divider';divider.textContent='Brokers';box.append(divider);}
  const button=document.createElement('button');button.type='button';button.dataset.balanceBroker=name;button.dataset.brokerTheme=brokerTheme(name);button.className='cfh-broker-choice';button.setAttribute('aria-pressed',String(name===balanceBroker));
  const logo=document.createElement('span');logo.className='cfh-broker-choice-logo';
  logo.append(brokerLogoNode(name));
  const details=document.createElement('span'),title=document.createElement('strong'),amount=document.createElement('small'),value=document.createElement('b');title.textContent=name||'All Brokers';const p=portfolio(name?state.rows.filter(r=>r.broker===name):state.rows,asset);value.textContent=balancesHidden?'••••':peso(p.invested);amount.append(document.createTextNode('Total Money '),value);details.append(title,amount);button.append(logo,details);
  if(name===balanceBroker){const check=document.createElement('span');check.className='cfh-broker-choice-check';check.textContent='✓';check.setAttribute('aria-label','Selected');button.append(check);}
  button.onclick=()=>{balanceBroker=name;render();close('cfhBalanceModal');};box.append(button);
 }
}

function openDividendModal(){
 const f=$('cfhPortfolioDividendForm');f.reset();f.elements.asset.value='stock';f.elements.status.value='upcoming';f.elements.paymentDate.value='';
 const names=[...new Set(['COL Financial','DragonFi','DragonFi Lite (Maya)',...state.rows.map(r=>r.broker)].filter(Boolean))];
 $('cfhDividendBroker').replaceChildren(new Option('Choose broker',''),...names.map(n=>new Option(n,n)));
 $('cfhDividendSymbol').value='';
 $('cfhPortfolioDividendFormStatus').textContent='';$('cfhPortfolioDividendTotal').textContent=peso(0);
 $('cfhPortfolioDividendModal').hidden=false;$('cfhDividendBroker').focus({preventScroll:true});
}
function updateDividendTotal(){
 const f=$('cfhPortfolioDividendForm'),gross=Number(f.elements.shares.value)*Number(f.elements.perShare.value),tax=Number(f.elements.tax.value||0);
 $('cfhPortfolioDividendTotal').textContent=peso(money(Math.max(0,gross-tax)));
}
function saveDividend(e){
 e.preventDefault();const f=e.target;
 try{
  localSave({kind:'dividend',asset:'stock',broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),shares:Number(f.elements.shares.value),perShare:Number(f.elements.perShare.value),tax:Number(f.elements.tax.value||0),paymentDate:f.elements.paymentDate.value,status:f.elements.status.value,notes:f.elements.notes.value.trim()});
  close('cfhPortfolioDividendModal');f.reset();renderHistoryView();
 }catch(error){$('cfhPortfolioDividendFormStatus').textContent=error.message;}
}
export function mountPortfolio(){
 if(!$('cfhPortfolioPage')||window.cfhPortfolioMounted)return;window.cfhPortfolioMounted=true;
 const mainNav=document.querySelector('.cfh-bottom-nav');
 const syncCryptoNavHeight=()=>{if(mainNav)$('cfhPortfolioPage').style.setProperty('--crypto-main-nav-height',`${mainNav.getBoundingClientRect().height}px`);};
 if(mainNav&&typeof ResizeObserver!=='undefined')new ResizeObserver(syncCryptoNavHeight).observe(mainNav);
 window.addEventListener('resize',syncCryptoNavHeight);syncCryptoNavHeight();
 mountCryptoNav(document,window);
 const sheetHandle=$('cfhBalanceModal').querySelector('.cfh-sheet-handle');let sheetStartY=null;sheetHandle.addEventListener('pointerdown',e=>{sheetStartY=e.clientY;sheetHandle.setPointerCapture(e.pointerId);});sheetHandle.addEventListener('pointerup',e=>{if(sheetStartY!==null&&e.clientY-sheetStartY>40)close('cfhBalanceModal');sheetStartY=null;});sheetHandle.addEventListener('pointercancel',()=>{sheetStartY=null;});for(const type of ['touchstart','touchmove','touchend','pointerdown','pointermove','pointerup'])$('cfhBalanceModal').addEventListener(type,e=>e.stopPropagation(),{passive:true});
 $('cfhPortfolioInvestButton').onclick=openInvest;$('cfhPortfolioBreakdown').onclick=breakdown;$('cfhBalanceManage').onclick=()=>openValue('cash',balanceBroker?{broker:balanceBroker}:undefined);$('cfhBalanceSwitch').onclick=switchBalanceBroker;$('cfhBalanceVisibility').onclick=()=>{balancesHidden=!balancesHidden;$('cfhBalanceVisibility').setAttribute('aria-pressed',String(balancesHidden));$('cfhBalanceVisibility').setAttribute('aria-label',balancesHidden?'Show balances':'Hide balances');render();};
 document.querySelectorAll('[data-portfolio-page]').forEach(b=>b.onclick=()=>{selectPortfolioView(b.dataset.portfolioPage);window.scrollTo({top:0,behavior:'auto'});});
 document.querySelectorAll('[data-dividend-status]').forEach(b=>b.onclick=()=>{dividendStatus=b.dataset.dividendStatus;renderHistoryView();});
 let dividendTouch=null,dividendSwipeUntil=0;
 const swipeSurface=document;
 swipeSurface.addEventListener('touchstart',e=>{
  const control=e.target.closest('button,input,select,textarea,a');
  if($('cfhPortfolioPage').hidden||portfolioView!=='dividends'||e.touches.length!==1||e.target.closest('.cfh-portfolio-overlay,#cfhCryptoNav,.cfh-bottom-nav')||(control&&!control.matches('[data-dividend-status]'))){dividendTouch=null;return;}
  const t=e.touches[0];dividendTouch={x:t.clientX,y:t.clientY,horizontal:false};e.stopPropagation();
 },{passive:true,capture:true});
 swipeSurface.addEventListener('touchmove',e=>{
  if(!dividendTouch)return;
  if(e.touches.length!==1){dividendTouch=null;return;}
  const t=e.touches[0],dx=t.clientX-dividendTouch.x,dy=t.clientY-dividendTouch.y;
  if(!dividendTouch.horizontal&&Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.4){dividendTouch=null;return;}
  if(Math.abs(dx)>=8&&Math.abs(dx)>Math.abs(dy)*1.15)dividendTouch.horizontal=true;
  if(dividendTouch.horizontal){if(e.cancelable)e.preventDefault();e.stopPropagation();}
 },{passive:false,capture:true});
 swipeSurface.addEventListener('touchend',e=>{
  if(!dividendTouch)return;
  const start=dividendTouch;dividendTouch=null;const t=e.changedTouches[0];
  const dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(Math.abs(dx)<24||(!start.horizontal&&Math.abs(dx)<Math.abs(dy)*1.15))return;
  if(e.cancelable)e.preventDefault();e.stopPropagation();dividendSwipeUntil=Date.now()+400;
  const next=dx<0?'upcoming':'paid';
  if(dividendStatus!==next){dividendStatus=next;renderHistoryView();}
 },{passive:false,capture:true});
 swipeSurface.addEventListener('touchcancel',()=>{dividendTouch=null;},{passive:true,capture:true});
 swipeSurface.addEventListener('click',e=>{if(Date.now()<dividendSwipeUntil){e.preventDefault();e.stopImmediatePropagation();}},true);

 $('cfhPortfolioDividendForm').onsubmit=saveDividend;
 $('cfhPortfolioDividendForm').oninput=updateDividendTotal;
 for(const b of document.querySelectorAll('[data-portfolio-asset]'))b.onclick=()=>{asset=b.dataset.portfolioAsset;render();if(asset==='stock')void refreshStockPrices();};
 for(const b of document.querySelectorAll('[data-portfolio-close]'))b.onclick=()=>close(b.dataset.portfolioClose);
 for(const id of ['cfhPortfolioModal','cfhPortfolioValueModal','cfhPortfolioDividendModal','cfhHoldingSnapshotModal','cfhBalanceModal']){$(id).onclick=e=>{if(e.target===$(id))close(id);};$(id).onkeydown=e=>{if(e.key==='Escape')close(id);if(e.key==='Tab'){const nodes=[...$(id).querySelectorAll('button,input,select,textarea')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};}
 for(const type of ['touchstart','touchmove','touchend','pointerdown','pointermove','pointerup'])$('cfhPortfolioModal').addEventListener(type,e=>e.stopPropagation(),{passive:true});
 const sortTrigger=$('cfhHoldingSort'),sortMenu=$('cfhHoldingSortMenu'),sortWrap=$('cfhHoldingSortLabel');
 function closeSortMenu(focus=false){sortMenu.hidden=true;sortTrigger.setAttribute('aria-expanded','false');if(focus)sortTrigger.focus({preventScroll:true});}
 function openSortMenu(last=false){sortMenu.hidden=false;sortTrigger.setAttribute('aria-expanded','true');const buttons=[...sortMenu.children];(last?buttons.at(-1):buttons.find(b=>b.getAttribute('aria-checked')==='true')||buttons[0])?.focus({preventScroll:true});}
 for(const [value,label]of holdingSortChoices){const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(value===holdingSort));button.textContent=label;button.onclick=()=>{holdingSort=validHoldingSort(value);for(const child of sortMenu.children)child.setAttribute('aria-checked',String(child===button));closeSortMenu(true);render();};sortMenu.append(button);}
 sortTrigger.onclick=()=>{if(sortMenu.hidden)openSortMenu();else closeSortMenu();};
 sortTrigger.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openSortMenu(e.key==='ArrowUp');}if(e.key==='Escape')closeSortMenu(true);};
 sortMenu.onkeydown=e=>{const buttons=[...sortMenu.children],index=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSortMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Tab')closeSortMenu();};
 document.addEventListener('click',e=>{if(!sortWrap.contains(e.target))closeSortMenu();});
 sortWrap.addEventListener('focusout',e=>{if(!sortWrap.contains(e.relatedTarget))closeSortMenu();});
 $('cfhPortfolioForm').elements.date.onchange=()=>{updateTotal();saveDraft();};
 $('cfhPortfolioForm').oninput=e=>{if(e.target.name==='fees')feeMode='manual';updateTotal();saveDraft();};
 $('cfhUseFeeEstimate').onclick=()=>{feeMode='auto';updateTotal();saveDraft();};
 $('cfhPortfolioForm').elements.purchaseType.onchange=()=>{feeMode='auto';updateTotal();saveDraft();};
 $('cfhPortfolioBroker').onchange=()=>{const adding=$('cfhPortfolioBroker').value==='__add__';$('cfhPortfolioAddBroker').hidden=!adding;if(adding)$('cfhPortfolioNewBroker').focus();updateTotal();saveDraft();};
 $('cfhPortfolioAddBrokerButton').onclick=()=>{const name=$('cfhPortfolioNewBroker').value.trim();if(!name)return;populateBrokers(name);const names=[...$('cfhPortfolioBroker').options].map(o=>o.value).filter(v=>v&&v!=='__add__');try{localStorage.setItem(BROKERS_KEY,JSON.stringify(names));}catch{}$('cfhPortfolioAddBroker').hidden=true;updateTotal();saveDraft();};
 $('cfhPortfolioSymbol').addEventListener('input',showSuggestions);$('cfhPortfolioSymbol').onfocus=showSuggestions;
 $('cfhPortfolioSymbol').onkeydown=e=>{if(e.key==='ArrowDown'&&!$('cfhPortfolioSuggestions').hidden){e.preventDefault();$('cfhPortfolioSuggestions').firstElementChild?.focus();}if(e.key==='Escape'){e.stopPropagation();hideSuggestions();}};
 $('cfhPortfolioSuggestions').onkeydown=e=>{const buttons=[...$('cfhPortfolioSuggestions').children],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){e.stopPropagation();hideSuggestions();$('cfhPortfolioSymbol').focus();hideSuggestions();}};
 document.addEventListener('click',e=>{if(e.target!==$('cfhPortfolioSymbol')&&!$('cfhPortfolioSuggestions').contains(e.target))hideSuggestions();});
 window.addEventListener('pagehide',()=>{if(!$('cfhPortfolioModal').hidden)saveDraft();});
 $('cfhPortfolioForm').onsubmit=e=>{e.preventDefault();const f=e.target;try{if(!f.elements.broker.value||f.elements.broker.value==='__add__')throw Error('Choose or add a broker.');if(f.elements.fees.value==='')throw Error('Enter the invoice fee, including 0 if none was charged.');localSave({kind:'purchase',asset:f.elements.asset.value,broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),date:f.elements.date.value,shares:Number(f.elements.shares.value),price:Number(f.elements.price.value),fees:Number(f.elements.fees.value||0),notes:(f.elements.purchaseType.value==='ipo'?'IPO allocation'+(f.elements.notes.value.trim()?' · ':''):'')+f.elements.notes.value.trim()});close('cfhPortfolioModal');clearDraft();f.reset();}catch(error){$('cfhPortfolioFormStatus').textContent=error.message;}};
 $('cfhPortfolioValueForm').onsubmit=e=>{e.preventDefault();const f=e.target;try{localSave({kind:f.elements.kind.value,asset,broker:f.elements.broker.value.trim(),symbol:f.elements.symbol.value.trim().toUpperCase(),price:Number(f.elements.price.value)});close('cfhPortfolioValueModal');}catch(error){$('cfhPortfolioValueStatus').textContent=error.message;}};
 window.cfhPortfolioRender=()=>{holdingSort='symbol';for(const [i,button] of [...$('cfhHoldingSortMenu').children].entries())button.setAttribute('aria-checked',String(holdingSortChoices[i]?.[0]===holdingSort));render();if(client)void sync();if(asset==='stock')void refreshStockPrices();};render();status(state.pending.length?'Saved on device · Sync pending':'Connecting portfolio sync…');
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('cfh-crypto-active')){render();if(asset==='stock')void refreshStockPrices();}});
}
async function refreshStockPrices(){
 if(document.hidden||asset!=='stock'||!document.body.classList.contains('cfh-crypto-active'))return;
 render();
 if(!client||livePriceBusy||!navigator.onLine)return;
 // The provider can return the latest closing quote outside trading hours too.
 const symbols=[...new Set(portfolio(state.rows,'stock').holdings.map(h=>h.symbol))];
 const node=$('cfhMarketPriceStatus');
 if(!symbols.length){if(node)node.textContent='Add a stock holding to see live PSE prices.';return;}
 livePriceBusy=true;
 if(node&&!liveStockPrices.size)node.textContent='Loading live PSE prices…';
 try{
  const {data,error}=await client.functions.invoke('cfh-stock-prices',{body:{symbols}});
  if(error)throw error;
  saveStockPrices(data);
  render();
 }catch(error){
  if(node)node.textContent=liveStockPrices.size?'Could not refresh · '+stockPriceStatus():'Live prices unavailable · '+(error.message||'try again later');
  console.warn('PSE price refresh:',error.message);
 }finally{livePriceBusy=false;}
}
function scheduleStockPriceRefresh(){
 clearInterval(livePriceTimer);
 livePriceTimer=setInterval(()=>{if(asset==='stock')void refreshStockPrices();},180000);
}
async function sync(){
 if(!client||busy||!navigator.onLine){if(state.pending.length)status('Saved on device · Sync pending');return;}busy=true;
 try{
  for(const id of state.pending.slice()){const row=state.rows.find(r=>r.id===id);if(!row)continue;const {error}=await client.from('cfh_portfolio_records').insert({owner_id:OWNER,id,payload:row});if(error&&error.code!=='23505')throw error;state.pending=state.pending.filter(x=>x!==id);persist();}
  const remote=[];for(let start=0;;start+=500){const {data,error}=await client.from('cfh_portfolio_records').select('id,payload').eq('owner_id',OWNER).order('created_at',{ascending:true}).order('id',{ascending:true}).range(start,start+499);if(error)throw error;remote.push(...data);if(data.length<500)break;}
  const pendingIds=new Set(state.pending);
  const map=new Map(state.rows.filter(r=>pendingIds.has(r.id)).map(r=>[r.id,r]));for(const r of remote){try{validateRecord(r.payload);map.set(r.id,{...r.payload,id:r.id});}catch{}}
  state.rows=[...map.values()];persist();render();status(state.pending.length?'Saved on device · Sync pending':'Portfolio synced');
 }catch(error){status('Saved on device · Sync pending. Reconnect to retry.');console.warn('Portfolio sync:',error.message);}finally{busy=false;if(refreshRequested){refreshRequested=false;void sync();}}
}
export function startPortfolioSync(c,owner){if(owner!==OWNER)throw Error('Portfolio account mismatch');if(client)return;client=c;mountPortfolio();void sync();scheduleStockPriceRefresh();void refreshStockPrices();
 const connect=()=>{if(document.hidden||!navigator.onLine||channel)return;channel=client.channel('cfh-portfolio:'+OWNER).on('postgres_changes',{event:'*',schema:'public',table:'cfh_portfolio_records',filter:'owner_id=eq.'+OWNER},()=>{if(busy)refreshRequested=true;else void sync();}).subscribe(s=>{if(s==='SUBSCRIBED')void sync();});};
 const disconnect=()=>{if(channel){void client.removeChannel(channel);channel=null;}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disconnect();else{connect();void sync();}});window.addEventListener('online',()=>{connect();void sync();});window.addEventListener('offline',disconnect);window.addEventListener('pagehide',disconnect);window.addEventListener('pageshow',()=>{connect();void sync();});connect();
}
mountPortfolio();
