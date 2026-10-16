export const money=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
export function validateRecord(row){
 if(!row||!['purchase','quote','cash','dividend'].includes(row.kind))throw Error('Invalid investment record.');
 if(!['stock','crypto'].includes(row.asset))throw Error('Choose Stocks or Crypto.');
 if(typeof row.broker!=='string'||!row.broker.trim()||row.broker.length>80)throw Error('Enter your broker.');
 if(row.kind!=='cash'&&!/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(row.symbol||''))throw Error('Enter a valid stock or coin symbol.');
 if(row.kind==='dividend'){
  if(row.asset!=='stock')throw Error('Dividends can only be recorded for stocks.');
  if(!['paid','upcoming'].includes(row.status))throw Error('Choose Paid or Upcoming.');
  if(!Number.isFinite(row.shares)||row.shares<=0||row.shares>1e12)throw Error('Enter valid eligible shares.');
  if(!Number.isFinite(row.perShare)||row.perShare<=0||row.perShare>1e12)throw Error('Enter a valid dividend per share.');
  if(!Number.isFinite(row.tax)||row.tax<0||row.tax>row.shares*row.perShare)throw Error('Enter valid tax withheld.');
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(row.paymentDate||'')||new Date(row.paymentDate+'T12:00:00Z').toISOString().slice(0,10)!==row.paymentDate)throw Error('Enter a valid payment date.');
  if(row.notes&&row.notes.length>500)throw Error('Notes must be 500 characters or less.');
  return row;
 }
 if(!Number.isFinite(row.price)||row.price<0||row.price>1e12||(row.kind==='purchase'&&row.price===0))throw Error('Enter a valid price.');
 if(row.kind==='purchase'){
  if(!Number.isFinite(row.shares)||row.shares<=0||row.shares>1e12||(row.asset==='stock'&&!Number.isInteger(row.shares)))throw Error('Enter valid shares or units.');
  if(!Number.isFinite(row.fees)||row.fees<0||row.fees>1e12)throw Error('Enter valid broker fees.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date)throw Error('Enter a valid purchase date.');
  if(row.notes&&row.notes.length>500)throw Error('Notes must be 500 characters or less.');
  if(row.shares*row.price+row.fees>1e12)throw Error('Investment amount is too large.');
 }
 return row;
}
export function portfolio(records,asset='stock'){
 const rows=records.filter(r=>{try{return validateRecord(r)&&r.asset===asset;}catch{return false;}}).slice().sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))||String(a.id||'').localeCompare(String(b.id||''))),groups=new Map(),quotes=new Map(),cash=new Map();
 for(const row of rows){
  try{validateRecord(row);}catch{continue;}
  if(row.kind==='dividend')continue;
  const key=row.broker+'|'+row.symbol;
  if(row.kind==='cash'){cash.set(row.broker,row.price);continue;}
  if(row.kind==='quote'){quotes.set(key,row);continue;}
  const h=groups.get(key)||{key,broker:row.broker,symbol:row.symbol,shares:0,cost:0};
  h.shares+=row.shares;h.cost=money(h.cost+money(row.shares*row.price+row.fees));groups.set(key,h);
 }
 const holdings=[...groups.values()].map(h=>{const q=quotes.get(h.key);const value=q?money(h.shares*q.price):null;return {...h,price:q?.price??null,quoteAt:q?.at??null,value,gain:value===null?null:money(value-h.cost),percent:value===null?null:(value-h.cost)/h.cost*100};}).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.broker.localeCompare(b.broker));
 const invested=money(holdings.reduce((n,h)=>n+h.cost,0)),cashAvailable=money([...cash.values()].reduce((n,v)=>n+v,0));
 const complete=holdings.every(h=>h.value!==null),value=complete?money(holdings.reduce((n,h)=>n+h.value,0)):null;
 return {holdings,invested,cashAvailable,value,balance:value===null?null:money(value+cashAvailable),gain:value===null?null:money(value-invested),percent:value===null||!invested?null:(value-invested)/invested*100};
}
export function marketPhase(now=new Date(),asset='stock'){
 if(asset==='crypto')return {label:'Crypto · 24/7 market',open:true};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const t=Number(parts.hour)*60+Number(parts.minute);
 if(['Sat','Sun'].includes(parts.weekday)||t<540||t>=915)return {label:'Stock market closed · schedule',open:false};
 if(t<570)return {label:'Pre-open · schedule',open:false};
 if(t>=720&&t<780)return {label:'Market recess · schedule',open:false};
 if(t>=885)return {label:'Closing session · schedule',open:true};
 return {label:'Stock market open · schedule',open:true};
}
