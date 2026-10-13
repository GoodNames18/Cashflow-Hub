export async function registerReminderDelta(delta,notifications,diagnostics){
 if(delta.cancel.length)await notifications.cancel({notifications:delta.cancel});
 for(let i=0;i<delta.schedule.length;i+=100)await notifications.schedule({notifications:delta.schedule.slice(i,i+100)});
 if(!delta.schedule.length)return;
 const result=await diagnostics.confirmScheduled({alarms:delta.schedule.map(job=>({id:job.id,target:job.schedule.at.getTime()}))});
 if(!result.confirmed)throw new Error('Android did not confirm reminder registration');
}
