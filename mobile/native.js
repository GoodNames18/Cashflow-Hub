import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderJobs } from './reminders.mjs';
import { reminderDelta } from './reconcile-reminders.mjs';
import { createReminderScheduler } from './reminder-scheduler.mjs';
import { registerReminderDelta } from './register-reminders.mjs';
const Diagnostics=registerPlugin('ReminderDiagnostics');
const PLAN='cfh-native-alarm-plan-v1';
const KEYS=['cfh_card_panel_preferences_v1','cfh_eastwest_cycle_overrides_v1','cfh_calendar_bells_v1','cfh_calendar_event_deletions_v1','cfh_metrobank_due_overrides_v1','cfh_metrobank_status_v1','cfh_calendar_entries_v1'];
const ENABLED='cfh-native-reminders-enabled';let timer,last='';
const status=text=>window.cfhPushStatus?.(text);
function key(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
async function runSchedule(force=false){
 if(localStorage.getItem(ENABLED)!=='true')return {enabled:false};
 try{
  const report=await Diagnostics.getSchedulingState();
  if(!report.notificationsAllowed||!report.channelAllowed)throw new Error('Notification permission needed');
  const snapshot=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)||'']));
  const signature=JSON.stringify(snapshot)+key(new Date())+Intl.DateTimeFormat().resolvedOptions().timeZone+report.exactAllowed+report.alarmClock;
  if(!force&&last===signature)return {enabled:true,registered:true};
  const notifications=reminderJobs(snapshot);
  const pending=await LocalNotifications.getPending();
  let previous={};try{previous=JSON.parse(localStorage.getItem(PLAN)||'{}');}catch{}
  const delta=reminderDelta(notifications,pending.notifications,force?{}:previous,report.alarmClock);
  await registerReminderDelta(delta,LocalNotifications,Diagnostics);
  localStorage.setItem(PLAN,JSON.stringify(delta.next));
  last=signature;status(report.exactAllowed?'Reminder scheduled on this device':'Reminder registered · Allow alarms for exact timing');return {enabled:true,registered:true};
 }catch(error){status('Could not schedule reminders: '+error.message);last='';throw error;}
}
const schedule=createReminderScheduler(runSchedule);
const backgroundSchedule=()=>schedule().catch(()=>{});
function queue(){clearTimeout(timer);timer=setTimeout(backgroundSchedule,800);}
if(Capacitor.isNativePlatform()){
 window.CFH_NATIVE=true;
 window.cfhRegisterReminders=async()=>{clearTimeout(timer);return schedule();};
 window.cfhEnablePush=async()=>{
  const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted'){status('Allow notifications in Android settings');return;}
  await LocalNotifications.createChannel({id:'cfh-reminders',name:'Schedule reminders',importance:5,visibility:1,vibration:true});
  const exact=await LocalNotifications.checkExactNotificationSetting();if(exact.exact_alarm!=='granted')await LocalNotifications.changeExactNotificationSetting();
  localStorage.setItem(ENABLED,'true');await schedule(true);
 };
 window.cfhTestPush=async()=>{try{await LocalNotifications.schedule({notifications:[{id:2147483647,title:'Cashflow Hub',body:'Native notifications are working on this device.',smallIcon:'ic_stat_reminder',largeIcon:'cfh_app_icon',channelId:'cfh-reminders',schedule:{at:new Date(Date.now()+3000),allowWhileIdle:true}}]});status('Test scheduled in 3 seconds');}catch(e){status(e.message);}};
 window.cfhDisablePush=async()=>{const pending=await LocalNotifications.getPending();await LocalNotifications.cancel({notifications:pending.notifications});localStorage.removeItem(ENABLED);localStorage.removeItem(PLAN);last='';status('Notifications disabled on this device');};
 window.cfhPushSync=async()=>schedule();window.cfhPushQueue=queue;
 window.addEventListener('cfh-native-schedule-change',queue);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);backgroundSchedule();}else queue();});
 LocalNotifications.addListener('localNotificationActionPerformed',()=>{window.showAppPage?.('calendar');});
 mountDiagnostics();queue();
}

function mountDiagnostics(){
 const button=document.createElement('button');button.type='button';button.textContent='Reminder diagnostics';
 button.style.cssText='background:#1B1844;color:white;border:0;border-radius:9px;padding:10px 12px;margin:10px;font-size:12px';
 const attach=()=>{const panel=document.getElementById('cfhPushPanel');if(panel&&!panel.contains(button))panel.append(button);};
 const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();
 button.onclick=async()=>{
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:20000;background:#0008;display:grid;place-items:center;padding:24px';
  const box=document.createElement('div');box.style.cssText='background:white;color:#1B1844;border-radius:18px;padding:20px;max-width:520px;width:100%;max-height:80vh;overflow:auto';overlay.append(box);
  const title=document.createElement('h3');title.textContent='Reminder diagnostics';box.append(title);
  const output=document.createElement('pre');output.style.cssText='white-space:pre-wrap;font:12px sans-serif;line-height:1.5';
  const mode=document.createElement('button');mode.style.cssText=button.style.cssText;
  const description=document.createElement('p');description.style.fontSize='12px';description.textContent='Alarm mode uses Android’s alarm-clock scheduling and shows an upcoming alarm indicator. Posted means Android accepted the notification; it does not prove you saw it.';
  box.append(description,mode,output);document.body.append(overlay);
  const time=value=>value?new Date(value).toLocaleString(undefined,{hour12:true}):'—';
  const refresh=async()=>{const r=await Diagnostics.getReport();const p=await LocalNotifications.getPending();
   mode.textContent='Alarm mode: '+(r.alarmClock?'On':'Off');
   const reboot=r.events.filter(e=>e.event.startsWith('restore-')||e.event==='boot-received').slice(-15);
   const delivery=r.events.filter(e=>e.event!=='scheduled'&&e.event!=='cancelled'&&!e.event.startsWith('restore-')&&e.event!=='boot-received').slice(-30);
   const latest=new Map(r.events.filter(e=>e.event==='scheduled').map(e=>[e.id,e]));
   const upcoming=[...latest.values()].filter(e=>e.target>Date.now()-6*3600000).sort((a,b)=>a.target-b.target).slice(0,20);
   output.textContent='Exact alarms: '+r.exactAllowed+'\nNotifications: '+r.notificationsAllowed+'\nReminder channel: '+r.channelAllowed+'\nBattery saver: '+r.powerSave+'\nStored reminders: '+p.notifications.length+'\nTray notifications: '+r.active.length+'\n\nNearest scheduled reminders\n'+upcoming.map(e=>(e.detail||e.id)+' · '+e.mode+' · due '+time(e.target)+' · registered '+time(e.at)).join('\n')+'\n\nCurrently in notification tray\n'+(r.active.map(n=>n.id+' · '+n.title+' · posted '+time(n.at)).join('\n')||'None')+'\n\nReboot restoration\n'+(reboot.map(e=>e.event+' · '+time(e.at)+(e.detail?' · '+e.detail:'')).join('\n')||'No reboot restoration recorded yet.')+'\n\nDelivery log\n'+(delivery.map(e=>e.id+' · '+e.event+' · '+time(e.at)+(e.target?' · due '+time(e.target):'')+(e.detail?' · '+e.detail:'')).join('\n')||'No alarm delivery recorded yet.');return r;};
  mode.onclick=async()=>{mode.disabled=true;try{const r=await Diagnostics.getReport();if(!r.alarmClock){const exact=await LocalNotifications.checkExactNotificationSetting();if(exact.exact_alarm!=='granted'){await LocalNotifications.changeExactNotificationSetting();status('Allow alarms in Android settings, then enable alarm mode');return;}}
   await Diagnostics.setAlarmMode({enabled:!r.alarmClock});last='';await schedule(true);await refresh();
  }catch(e){output.textContent=e.message;}finally{mode.disabled=false;}};
  const reload=document.createElement('button');reload.textContent='Refresh log';reload.onclick=refresh;reload.style.cssText=button.style.cssText;
  const close=document.createElement('button');close.textContent='Close';close.style.cssText=button.style.cssText;close.onclick=()=>overlay.remove();box.append(reload,close);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};try{await refresh();}catch(e){output.textContent=e.message;}
 };
}
