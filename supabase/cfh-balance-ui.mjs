import {parseTwiceAsNyceEntry_} from './legacy-rules.mjs?v=moneyflow-digits1';
import {createBalanceMotion,writeDashboard} from './cfh-balance-motion.mjs';
const pageIds={twice:'twicePage',printing:'printingPage',gcash:'gcashPage',konek:'testPage',rental:'rentalPage',moneyFlow:'expensesPage'};
const peso=value=>'₱'+Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const number=text=>Number(String(text).replace(/[₱,\s]/g,'').replace(/−/g,'-'));
const period=page=>JSON.stringify(window.dashboardMonthParams?.(page)||{});
const motion=createBalanceMotion({period,visible:page=>{const node=document.getElementById(pageIds[page]);return !!node&&node.getClientRects().length>0;},readValues:page=>{
 const values={};document.getElementById(pageIds[page])?.querySelectorAll('.metric-value[id]').forEach(node=>{if(node.textContent.includes('₱'))values[node.id]=number(node.textContent);});return values;
},paint:(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=peso(value);},showDelta:(id,delta)=>{
 const card=document.getElementById(id)?.closest('.metric-card');if(!card||!delta)return;const badge=document.createElement('span');badge.className='cfh-balance-delta'+(delta<0?' is-negative':'');badge.textContent=(delta<0?'−':'+')+peso(Math.abs(delta));badge.setAttribute('aria-hidden','true');
 badge.style.color='#00F8B9';
 const slot=Number(card.dataset.balanceDeltaSequence||0)%4;
 card.dataset.balanceDeltaSequence=String(slot+1);
 badge.style.top=(8+slot*16)+'px';badge.style.right=(12+slot*4)+'px';
 card.append(badge);setTimeout(()=>badge.remove(),3000);
},reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,frame:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id)});
window.cfhBalanceMotion={arm:params=>motion.arm(writeDashboard(params)),render:page=>motion.render(page)};
// Cached dashboards can paint before this module finishes loading. Seed their baseline.
Object.keys(pageIds).forEach(page=>motion.render(page));

let twiceSaving=false;
window.cfhSaveTwiceEntry=category=>{
 const input=document.getElementById('twiceTransactionInput'),status=document.getElementById('twiceStatus');
 if(twiceSaving)return;
 let entry;
 try { entry=parseTwiceAsNyceEntry_(input.value,category); } catch(error) {status.textContent=error.message;return;}
 twiceSaving=true;window.setTwiceEntryButtonsDisabled(true);status.textContent='Saving…';
 const finish=()=>{twiceSaving=false;window.setTwiceEntryButtonsDisabled(false);};
 window.jsonpRequest({action:'twiceAdd',account:'PNB',category:entry.category,amount:entry.amount,description:entry.description||entry.category},result=>{
  finish();input.value='';status.textContent='✓ '+result.category+' '+peso(result.amount)+' added';window.loadTwiceAsNyceDashboard();
 },error=>{finish();status.textContent=error?.message||'Could not save. Please retry.';});
};
