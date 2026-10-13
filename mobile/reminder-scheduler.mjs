// A caller waits until its request and changes arriving during that request finish.
export function createReminderScheduler(run){
 let active=null,requested=false,forceNext=false;
 return function request(force=false){
  requested=true;forceNext ||= force;
  if(active)return active;
  active=(async()=>{let result;while(requested){requested=false;const forced=forceNext;forceNext=false;result=await run(forced);}return result;})().finally(()=>{active=null;});
  return active;
 };
}
