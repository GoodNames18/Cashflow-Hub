import {money,validateRecord} from './cfh-portfolio-model.mjs';
export function expectedDividendNet(row){return row.expectedNetAmount??money(row.shares*row.perShare-row.tax);}
export function dividendNet(row){return row.status==='paid'?(row.receivedNetAmount??expectedDividendNet(row)):expectedDividendNet(row);}
export function latestDividends(records){
 const map=new Map();
 for(const row of records.filter(r=>r.kind==='dividend'&&r.asset==='stock')){
  const key=row.recordId||row.id,prev=map.get(key);
  const compare=(a,b)=>String(a.at||'').localeCompare(String(b.at||''))||String(a.confirmedAt||'').localeCompare(String(b.confirmedAt||''))||(Number(a.status==='paid')-Number(b.status==='paid'))||String(a.id||'').localeCompare(String(b.id||''));
  if(!prev||compare(row,prev)>0)map.set(key,row);
 }
 return [...map.values()];
}
export function dividendReceiptState(row,today){return row.status==='paid'?'paid':row.paymentDate<today?'overdue':row.paymentDate===today?'due':'expected';}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function confirmDividendReceipt(row,{amount,paidDate,reference=''},now=new Date()){
 validateRecord(row);
 if(row.status!=='upcoming')throw Error('This dividend has already been confirmed.');
 const text=String(amount).trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(text)||!Number.isFinite(Number(text))||Number(text)<=0||Number(text)>1e12)throw Error('Enter the amount received, greater than 0 and with at most two decimal places.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!validDate(paidDate)||paidDate>today)throw Error('Choose the actual receipt date, today or earlier.');
 if(typeof reference!=='string'||reference.trim().length>120)throw Error('Reference must be 120 characters or less.');
 const expectedNetAmount=expectedDividendNet(row),receivedNetAmount=money(Number(text));
 const confirmed={...row,status:'paid',recordId:row.recordId||row.id,expectedNetAmount,receivedNetAmount,varianceAmount:money(receivedNetAmount-expectedNetAmount),paidDate,confirmedAt:now.toISOString(),reference:reference.trim(),verification:'user_confirmed'};
 validateRecord(confirmed);return confirmed;
}
