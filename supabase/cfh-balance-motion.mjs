// A write arms one dashboard/period; cache replays and plain refreshes never arm it.
export function createBalanceMotion({readValues,paint,showDelta,visible,period,now=Date.now,reduced=()=>false,frame=requestAnimationFrame,cancel=cancelAnimationFrame}) {
 const states=new Map(),pending=new Map(),running=new Map();
 function stop(id){const job=running.get(id);if(job){cancel(job.frame);running.delete(id);}return job;}
 function arm(page){if(page)pending.set(page,{until:now()+30000,period:period(page)});}
 function render(page){
  const key=period(page),values=readValues(page),old=states.get(page),ticket=pending.get(page);
  states.set(page,{key,values});
  const animate=old&&old.key===key&&ticket&&ticket.period===key&&ticket.until>=now()&&visible(page);
  let changed=false;
  for(const [id,value] of Object.entries(values)){
   if(!Number.isFinite(value))continue;
   const previous=old?.values[id],active=running.get(id);
   if(active && old.key===key && value===previous && visible(page)){paint(id,active.value);continue;}
   const job=stop(id);
   if(!animate||!Number.isFinite(previous)||value===previous){paint(id,value);continue;}
   changed=true;
   if(reduced()){paint(id,value);continue;}
   showDelta(id,Math.round((value-previous)*100)/100);
   const start=job?.value??previous,started=now(),next={value:start,frame:null};
   const tick=()=>{if(running.get(id)!==next)return;const progress=Math.min(1,(now()-started)/1000);next.value=start+(value-start)*(1-Math.pow(1-progress,3));paint(id,progress===1?value:next.value);if(progress<1)next.frame=frame(tick);else running.delete(id);};
   running.set(id,next);paint(id,start);next.frame=frame(tick);
  }
  if(changed||!old||old.key!==key||!visible(page)||ticket?.until<now())pending.delete(page);
 }
 return {arm,render};
}
export function writeDashboard(params){
 const action=params?.action||'';
 if(['transactionEdit','transactionDelete','transactionRestore'].includes(action))return {'TwiceAsNyce':'twice','Printing Business':'printing','Cash In/Out':'gcash','Konek2Card':'konek','Rental':'rental','Money Flow':'moneyFlow'}[params.sheet];
 if(action==='twiceAdd')return 'twice';if(action==='printingAdd')return 'printing';if(action.startsWith('gcash')&&!/Dashboard|Transactions/.test(action))return 'gcash';if(action.startsWith('test')&&!/Dashboard|Transactions/.test(action))return 'konek';if(action==='rentalAdd')return 'rental';if(action==='expense'||action==='installmentCreate')return 'moneyFlow';
}
