package com.capacitorjs.plugins.localnotifications
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
internal object CfhAlarmJournal {
 @Synchronized fun record(context: Context, event: String, id: Int, target: Long = 0, mode: String = "", detail: String = "") {
  try {
   val prefs=context.getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE)
   val old=JSONArray(prefs.getString("events","[]"));val next=JSONArray()
   for(i in maxOf(0,old.length()-999) until old.length())next.put(old.get(i))
   next.put(JSONObject().put("event",event).put("id",id).put("at",System.currentTimeMillis()).put("target",target).put("mode",mode).put("detail",detail))
   val edit=prefs.edit().putString("events",next.toString())
   if(event=="scheduled"||event=="cancelled")edit.apply() else edit.commit()
  }catch(_:Exception){}
 }
}
