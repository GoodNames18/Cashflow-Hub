import {createBalanceMotion,writeDashboard} from './cfh-balance-motion.mjs';
const pageIds={twice:'twicePage',printing:'printingPage',gcash:'gcashPage',konek:'testPage',rental:'rentalPage',moneyFlow:'expensesPage'};
const peso=value=>'₱'+Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const number=text=>Number(String(text).replace(/[₱,\s]/g,'').replace(/−/g,'-'));
const period=page=>JSON.stringify(window.dashboardMonthParams?.(page)||{});
const motion=createBalanceMotion({period,visible:page=>{const node=document.getElementById(pageIds[page]);return !!node&&node.getClientRects().length>0;},readValues:page=>{
 const values={};document.getElementById(pageIds[page])?.querySelectorAll('.metric-value[id]').forEach(node=>{if(node.textContent.includes('₱'))values[node.id]=number(node.textContent);});return values;
},paint:(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=peso(value);},showDelta:(id,delta)=>{
 const card=document.getElementById(id)?.closest('.metric-card');if(!card||!delta)return;card.querySelector('.cfh-balance-delta')?.remove();const badge=document.createElement('span');badge.className='cfh-balance-delta'+(delta<0?' is-negative':'');badge.textContent=(delta<0?'−':'+')+peso(Math.abs(delta));badge.setAttribute('aria-hidden','true');card.append(badge);setTimeout(()=>badge.remove(),1200);
},reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,frame:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id)});
window.cfhBalanceMotion={arm:params=>motion.arm(writeDashboard(params)),render:page=>motion.render(page)};
// Cached dashboards can paint before this module finishes loading. Seed their baseline.
Object.keys(pageIds).forEach(page=>motion.render(page));
const dialog=document.getElementById('twiceBankDialog'),form=document.getElementById('twiceBankForm'),kind=document.getElementById('twiceBankKind'),amount=document.getElementById('twiceBankAmount'),detail=document.getElementById('twiceBankDescription'),status=document.getElementById('twiceBankStatus'),save=document.getElementById('twiceBankSave'),cancel=document.getElementById('twiceBankCancel');
let category='Income',saving=false;
window.openTwiceBankEntry=value=>{
 if(saving)return;category=value==='Expense'?'Expense':'Income';form.reset();status.textContent='';document.getElementById('twiceBankHeading').textContent=category==='Income'?'PNB income':'PNB expense';save.textContent=category==='Income'?'Save income':'Save expense';kind.replaceChildren(...(category==='Income'?['Shopee withdrawal','Other income']:['Supplies / stocks','Other expense']).map(text=>{const option=document.createElement('option');option.textContent=text;option.value=text;return option;}));dialog.showModal();amount.focus();
};
cancel.onclick=()=>{if(!saving)dialog.close();};dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});dialog.addEventListener('click',event=>{if(event.target===dialog&&!saving){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
form.addEventListener('submit',event=>{
 event.preventDefault();if(saving)return;const value=number(amount.value);if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.000001){status.textContent='Enter a positive amount with up to two decimal places.';return;}
 const description=kind.value+(detail.value.trim()?' — '+detail.value.trim():'');if(description.length>200){status.textContent='Please shorten the description.';return;}
 saving=true;save.disabled=cancel.disabled=true;amount.disabled=kind.disabled=detail.disabled=true;status.textContent='Saving…';
 const finish=()=>{saving=false;save.disabled=cancel.disabled=false;amount.disabled=kind.disabled=detail.disabled=false;};
 window.jsonpRequest({action:'twiceAdd',account:'PNB',category,amount:value,description},result=>{finish();dialog.close();const message=document.getElementById('twiceStatus');message.textContent='✓ '+(category==='Income'?'Income':'Expense')+' '+peso(result.amount)+' saved';window.loadTwiceAsNyceDashboard();},error=>{finish();status.textContent=error?.message||String(error)||'Could not save. Please retry.';});
});
