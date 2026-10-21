export const holdingSortChoices=[['symbol','Symbol A–Z'],['broker','Broker'],['value-desc','Market Value: Highest first'],['value-asc','Market Value: Lowest first'],['gain-desc','Gain / Loss: Highest first'],['gain-asc','Gain / Loss: Lowest first'],['recent','Recently added']];
export function validHoldingSort(value){return holdingSortChoices.some(([key])=>key===value)?value:'symbol';}
export function sortHoldings(holdings,choice='symbol',records=[]){
 const mode=validHoldingSort(choice),latest=new Map();
 for(const r of records)if(r.kind==='purchase'&&r.asset==='stock'){const key=r.broker+'|'+r.symbol,stamp=Date.parse(r.at||r.date)||0;latest.set(key,Math.max(latest.get(key)||0,stamp));}
 const alphabetical=(a,b)=>a.symbol.localeCompare(b.symbol)||a.broker.localeCompare(b.broker);
 return [...holdings].sort((a,b)=>{
 if(mode==='broker')return a.broker.localeCompare(b.broker)||alphabetical(a,b);
 if(mode==='recent')return (latest.get(b.key)||0)-(latest.get(a.key)||0)||alphabetical(a,b);
 if(mode.startsWith('value-')||mode.startsWith('gain-')){const field=mode.startsWith('value-')?'value':'gain',av=a[field],bv=b[field];if(av===null||!Number.isFinite(av))return bv===null||!Number.isFinite(bv)?alphabetical(a,b):1;if(bv===null||!Number.isFinite(bv))return -1;return (mode.endsWith('desc')?bv-av:av-bv)||alphabetical(a,b);}
 return alphabetical(a,b);
 });
}
