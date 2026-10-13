package com.vergel.cashflowhub;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
@CapacitorPlugin(name="ReminderDiagnostics")
public class ReminderDiagnosticsPlugin extends Plugin {
 @PluginMethod public void getReport(PluginCall call) {
  try {
   var prefs=getContext().getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE);
   var alarms=(AlarmManager)getContext().getSystemService(Context.ALARM_SERVICE);
   var notifications=(NotificationManager)getContext().getSystemService(Context.NOTIFICATION_SERVICE);
   var power=(PowerManager)getContext().getSystemService(Context.POWER_SERVICE);
   JSObject result=new JSObject();
   JSONArray active=new JSONArray();
   for(var item:notifications.getActiveNotifications()) {
    JSObject n=new JSObject();n.put("id",item.getId());n.put("at",item.getPostTime());
    n.put("title",item.getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TITLE,""));active.put(n);
   }
   result.put("active",active);
   result.put("events",new JSONArray(prefs.getString("events","[]")));
   result.put("alarmClock",prefs.getBoolean("alarmClock",false));
   result.put("exactAllowed",Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());
   result.put("notificationsAllowed",notifications.areNotificationsEnabled());
   var channel=Build.VERSION.SDK_INT>=26?notifications.getNotificationChannel("cfh-reminders"):null;
   result.put("channelAllowed",channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);
   result.put("powerSave",power.isPowerSaveMode());result.put("idle",power.isDeviceIdleMode());
   result.put("batteryExempt",power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
   call.resolve(result);
  }catch(Exception e){call.reject("Could not read reminder diagnostics",e);}
 }
 @PluginMethod public void getSchedulingState(PluginCall call) {
  var prefs=getContext().getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE);
  var alarms=(AlarmManager)getContext().getSystemService(Context.ALARM_SERVICE);
  var notifications=(NotificationManager)getContext().getSystemService(Context.NOTIFICATION_SERVICE);
  var channel=Build.VERSION.SDK_INT>=26?notifications.getNotificationChannel("cfh-reminders"):null;
  JSObject result=new JSObject();result.put("alarmClock",prefs.getBoolean("alarmClock",false));
  result.put("exactAllowed",Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());
  result.put("notificationsAllowed",notifications.areNotificationsEnabled());
  result.put("channelAllowed",channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);
  call.resolve(result);
 }
 @PluginMethod public void confirmScheduled(PluginCall call) {
  try {
   var requested=call.getArray("alarms");if(requested==null){call.reject("Missing alarms");return;}
   var prefs=getContext().getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE);
   var events=new JSONArray(prefs.getString("events","[]"));
   var registered=new java.util.HashMap<Integer,Long>();
   for(int i=0;i<events.length();i++){
    var event=events.getJSONObject(i);var name=event.optString("event");
    if(name.equals("scheduled"))registered.put(event.getInt("id"),event.getLong("target"));
    else if(name.equals("cancelled"))registered.remove(event.getInt("id"));
   }
   boolean confirmed=true;
   for(int i=0;i<requested.length();i++){
    var alarm=requested.getJSONObject(i);
    if(!java.util.Objects.equals(registered.get(alarm.getInt("id")),alarm.getLong("target"))){confirmed=false;break;}
   }
   JSObject result=new JSObject();result.put("confirmed",confirmed);call.resolve(result);
  }catch(Exception e){call.reject("Could not confirm reminder registration",e);}
 }
 @PluginMethod public void setAlarmMode(PluginCall call) {
  getContext().getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE).edit().putBoolean("alarmClock",call.getBoolean("enabled",false)).commit();call.resolve();
 }
 @PluginMethod public void clear(PluginCall call) {
  getContext().getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE).edit().remove("events").commit();call.resolve();
 }
}
