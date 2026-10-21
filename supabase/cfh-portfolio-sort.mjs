import {money} from './cfh-portfolio-model.mjs';
export const holdingSortChoices=[['symbol','Symbol A–Z'],['broker','Broker'],['value-desc','Market Value: Highest first'],['value-asc','Market Value: Lowest first'],['gain-desc','Gain / Loss: Highest first'],['gain-asc','Gain / Loss: Lowest first'],['recent','Purchase date: Newest first']];
export function validHoldingSort(value){return holdingSortChoices.some(([key])=>key===value)?value:'symbol';}
export function sortHoldings(holdings,choice='symbol',records=[]){
 const mode=validHoldingSort(choice),latest=new Map();
 for(const r of records)if(r.kind==='purchase'&&r.asset==='stock'){const key=r.broker+'|'+r.symbol,stamp=Date.parse(r.date)||0;latest.set(key,Math.max(latest.get(key)||0,stamp));}
 const alphabetical=(a,b)=>a.symbol.localeCompare(b.symbol)||a.broker.localeCompare(b.broker);
 return (mode==='symbol'?combineSymbolHoldings(holdings):[...holdings]).sort((a,b)=>{
 if(mode==='broker')return a.broker.localeCompare(b.broker)||alphabetical(a,b);
 if(mode==='recent')return (latest.get(b.key)||0)-(latest.get(a.key)||0)||alphabetical(a,b);
 if(mode.startsWith('value-')||mode.startsWith('gain-')){const field=mode.startsWith('value-')?'value':'gain',av=a[field],bv=b[field];if(av===null||!Number.isFinite(av))return bv===null||!Number.isFinite(bv)?alphabetical(a,b):1;if(bv===null||!Number.isFinite(bv))return -1;return (mode.endsWith('desc')?bv-av:av-bv)||alphabetical(a,b);}
 return alphabetical(a,b);
 });
}

export function combineSymbolHoldings(holdings){
 const groups=new Map();for(const h of holdings){if(!groups.has(h.symbol))groups.set(h.symbol,[]);groups.get(h.symbol).push(h);}
 return [...groups.values()].map(parts=>{
 if(parts.length===1)return {...parts[0]};
 const shares=parts.reduce((n,h)=>n+h.shares,0),cost=money(parts.reduce((n,h)=>n+h.cost,0));
 const complete=parts.every(h=>Number.isFinite(h.value));const value=complete?money(parts.reduce((n,h)=>n+h.value,0)):null;
 const brokers=[...new Set(parts.map(h=>h.broker))].sort((a,b)=>a.localeCompare(b));
 const gain=value===null?null:money(value-cost);
 return {key:'symbol|'+parts[0].symbol,symbol:parts[0].symbol,broker:'All brokers',brokers,shares,cost,value,price:value===null||!shares?null:value/shares,gain,percent:gain===null||!cost?null:gain/cost*100,quoteAt:parts.map(h=>h.quoteAt).filter(Boolean).sort().at(-1)||null};
 });
}
