export function reminderDelta(jobs,pending,previous,mode,now=Date.now()){
 const desired=new Map(jobs.map(job=>[job.id,job]));const known=new Set(pending.map(job=>job.id));
 const signature=job=>JSON.stringify([job.title,job.body,job.schedule.at.toISOString(),mode]);
 const cancel=pending.filter(job=>job.id!==2147483647&&!desired.has(job.id)&&((previous[job.id]?.at??Date.parse(job.schedule?.at))>now));
 const schedule=jobs.filter(job=>!known.has(job.id)||previous[job.id]?.signature!==signature(job));
 const next=Object.fromEntries(jobs.map(job=>[job.id,{at:job.schedule.at.getTime(),signature:signature(job)}]));
 return {cancel,schedule,next};
}
