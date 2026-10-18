const fieldsByTab = {
  life_log: {date:0,time:1,category:2,description:3,notes:4},
  money_flow: {date:0,time:1,merchant:2,description:3,category:4,amount:5,payment:6},
  konek2card: {date:0,time:1,customer:2,amount:3,feeEarned:4,category:5,description:6},
  rental: {date:0,time:1,amount:2,type:3,category:4,description:5},
  printing: {date:0,time:1,amount:2,category:3,description:4},
  twice_as_nyce: {date:0,time:1,amount:2,category:3,description:4},
  cash_in_out: {date:0,time:1,amount:2,category:3,description:4}
};
const labels = {
  date:'Date',time:'Time',amount:'Amount',category:'Category',description:'Description',
  merchant:'Merchant',payment:'Payment method',customer:'Customer',feeEarned:'Fee earned',
  type:'Type',notes:'Notes'
};
function manilaParts(value) {
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  return {date,time};
}
function textValue(value,key) {
  const text=String(value??'').trim();
  if(text.length>500) throw new Error(labels[key]+' must be 500 characters or less.');
  if(['category','description'].includes(key)&&!text) throw new Error(labels[key]+' is required.');
  return text;
}
function moneyValue(value,key,{allowZero=false}={}) {
  const number=Number(String(value??'').replace(/[₱,\\s]/g,''));
  if(!Number.isFinite(number)||(!allowZero&&number<=0)||(allowZero&&number<0)||
     Math.abs(number*100-Math.round(number*100))>0.000001)
    throw new Error('Enter a valid '+labels[key].toLowerCase()+' with at most two decimal places.');
  return Math.round(number*100)/100;
}
function parseManilaDate(date,time) {
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!/^\\d{2}:\\d{2}$/.test(time))
    throw new Error('Enter a valid date and time.');
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
  const check=new Date(Date.UTC(year,month-1,day,hour,minute));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||
     check.getUTCHours()!==hour||check.getUTCMinutes()!==minute||hour>23||minute>59)
    throw new Error('Enter a valid date and time.');
  return new Date(date+'T'+time+':00+08:00').toISOString();
}
export function editableTransactionFields(record) {
  const map=fieldsByTab[record?.tab_key];
  if(!map) throw new Error('This transaction type cannot be edited.');
  const source=Array.isArray(record.source_values)?record.source_values:[];
  const parts=manilaParts(record.occurred_at);
  const values={
    date:parts.date,time:parts.time,
    amount:record.amount??'',
    category:record.category??'',
    description:record.description??''
  };
  if(record.tab_key==='life_log') values.notes=record.payload?.notes??source[4]??'';
  if(record.tab_key==='money_flow') {
    values.merchant=record.payload?.merchant??source[2]??'';
    values.payment=record.payload?.payment_method??source[6]??'';
  }
  if(record.tab_key==='konek2card') {
    values.customer=record.payload?.customer??source[2]??'';
    values.feeEarned=record.payload?.fee_earned??source[4]??0;
  }
  if(record.tab_key==='rental') values.type=record.payload?.type??source[3]??'';
  return Object.keys(map).map(key=>({
    key,label:labels[key],type:key==='date'?'date':key==='time'?'time':
      ['amount','feeEarned'].includes(key)?'number':key==='description'||key==='notes'?'textarea':'text',
    value:values[key]??'',step:['amount','feeEarned'].includes(key)?'0.01':undefined
  }));
}
export function buildTransactionEdit(record,values={}) {
  const map=fieldsByTab[record?.tab_key];
  if(!map) throw new Error('This transaction type cannot be edited.');
  const source=Array.isArray(record.source_values)?structuredClone(record.source_values):[];
  const payload=structuredClone(record.payload||{});
  const date=String(values.date??manilaParts(record.occurred_at).date);
  const time=String(values.time??manilaParts(record.occurred_at).time);
  const occurred_at=parseManilaDate(date,time);
  source[map.date]=occurred_at;
  source[map.time]=occurred_at;
  const updated={...record,occurred_at,source_values:source,payload};
  for(const [key,index] of Object.entries(map)) {
    if(key==='date'||key==='time'||!(key in values)) continue;
    const value=['amount','feeEarned'].includes(key)
      ? moneyValue(values[key],key,{allowZero:key==='feeEarned'})
      : textValue(values[key],key);
    source[index]=value;
    if(key==='amount') updated.amount=value;
    else if(key==='category') updated.category=value;
    else if(key==='description') updated.description=value;
    else if(key==='merchant') payload.merchant=value;
    else if(key==='payment') payload.payment_method=value;
    else if(key==='customer') payload.customer=value;
    else if(key==='feeEarned') payload.fee_earned=value;
    else if(key==='type') payload.type=value;
    else if(key==='notes') payload.notes=value;
  }
  updated.payload=payload;
  return {
    occurred_at:updated.occurred_at,
    amount:updated.amount??null,
    category:updated.category??'',
    description:updated.description??'',
    payload:updated.payload,
    source_values:updated.source_values
  };
}
