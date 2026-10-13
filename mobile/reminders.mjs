import { notificationEntries } from '../supabase/functions/cfh-push/kernel.ts';
function key(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function idFor(value){let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619);return (n>>>0)%2147483646+1;}
export function reminderJobs(snapshot,now=new Date()){
  const jobs=new Map(),used=new Set();
  // Refilled whenever the app opens or a synced schedule changes.
  for(let offset=0;offset<=400;offset++){
   const occurrence=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
   for(const entry of notificationEntries(snapshot,key(occurrence))){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time||''))continue;
    for(const before of entry.days){
     if(!Number.isInteger(before)||before<0||before>7)continue;
     const [h,m]=entry.time.split(':').map(Number),at=new Date(occurrence.getFullYear(),occurrence.getMonth(),occurrence.getDate()-before,h,m);
     if(at<=now)continue;
     const stamp=at.getTime();if(!jobs.has(stamp))jobs.set(stamp,{at,entries:[]});
     jobs.get(stamp).entries.push({entry,before});
    }
   }
  }
  // Group reminders at the same time: Android limits alarms while idle.
  const notifications=Array.from(jobs.values()).sort((a,b)=>a.at-b.at).slice(0,400).map(job=>{
   const titles=job.entries.map(({entry,before})=>entry.title+' · '+(before===0?'Today':before+' days before'));
   let id=idFor('cfh|'+job.at.toISOString());while(used.has(id))id=id%2147483646+1;used.add(id);
   return {id,title:job.entries.length===1?job.entries[0].entry.title:'Cashflow Hub · '+job.entries.length+' reminders',body:titles.join('\n'),largeBody:titles.join('\n'),smallIcon:'ic_stat_reminder',largeIcon:'cfh_app_icon',channelId:'cfh-reminders',schedule:{at:job.at,allowWhileIdle:true},extra:{page:'calendar'}};
  });
  return notifications;
}
