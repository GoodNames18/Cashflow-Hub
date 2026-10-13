import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderJobs } from './reminders.mjs';
const KEYS=['cfh_card_panel_preferences_v1','cfh_eastwest_cycle_overrides_v1','cfh_calendar_bells_v1','cfh_calendar_event_deletions_v1','cfh_metrobank_due_overrides_v1','cfh_metrobank_status_v1','cfh_calendar_entries_v1'];
const ENABLED='cfh-native-reminders-enabled';let timer,busy=false,last='';
const status=text=>window.cfhPushStatus?.(text);
function key(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
async function schedule(force=false){
 if(busy||localStorage.getItem(ENABLED)!=='true')return;
 busy=true;
 try{
  const permission=await LocalNotifications.checkPermissions();if(permission.display!=='granted'){status('Notification permission needed');return;}
  const exact=await LocalNotifications.checkExactNotificationSetting();
  const snapshot=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)||'']));
  const signature=JSON.stringify(snapshot)+key(new Date())+Intl.DateTimeFormat().resolvedOptions().timeZone+exact.exact_alarm;
  if(!force&&last===signature)return;
  const notifications=reminderJobs(snapshot);
  const pending=await LocalNotifications.getPending();if(pending.notifications.length)await LocalNotifications.cancel({notifications:pending.notifications});
  for(let i=0;i<notifications.length;i+=100)await LocalNotifications.schedule({notifications:notifications.slice(i,i+100)});
  last=signature;status(exact.exact_alarm==='granted'?'Native reminders scheduled on this device':'Reminders scheduled · Allow alarms for exact timing');
 }catch(error){status('Could not schedule reminders: '+error.message);last='';}
 finally{busy=false;}
}
function queue(){clearTimeout(timer);timer=setTimeout(()=>schedule(),800);}
if(Capacitor.isNativePlatform()){
 window.CFH_NATIVE=true;
 window.cfhEnablePush=async()=>{
  const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted'){status('Allow notifications in Android settings');return;}
  await LocalNotifications.createChannel({id:'cfh-reminders',name:'Schedule reminders',importance:5,visibility:1,vibration:true});
  const exact=await LocalNotifications.checkExactNotificationSetting();if(exact.exact_alarm!=='granted')await LocalNotifications.changeExactNotificationSetting();
  localStorage.setItem(ENABLED,'true');await schedule(true);
 };
 window.cfhTestPush=async()=>{try{await LocalNotifications.schedule({notifications:[{id:2147483647,title:'Cashflow Hub',body:'Native notifications are working on this device.',smallIcon:'ic_stat_reminder',largeIcon:'cfh_app_icon',channelId:'cfh-reminders',schedule:{at:new Date(Date.now()+3000),allowWhileIdle:true}}]});status('Test scheduled in 3 seconds');}catch(e){status(e.message);}};
 window.cfhDisablePush=async()=>{const pending=await LocalNotifications.getPending();await LocalNotifications.cancel({notifications:pending.notifications});localStorage.removeItem(ENABLED);last='';status('Notifications disabled on this device');};
 window.cfhPushSync=async()=>schedule();window.cfhPushQueue=queue;
 window.addEventListener('cfh-native-schedule-change',queue);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
 LocalNotifications.addListener('localNotificationActionPerformed',()=>{window.showAppPage?.('calendar');});
 queue();
}
