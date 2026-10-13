package com.capacitorjs.plugins.localnotifications
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
internal object CfhAlarmJournal {
 private val batch=ThreadLocal<MutableList<JSONObject>>()
 fun beginBatch(){batch.set(ArrayList())}
 fun flushBatch(context:Context){val events=batch.get() ?: return;if(events.isNotEmpty()){append(context,events.toList());events.clear()}}
 fun endBatch(context:Context){try{flushBatch(context)}finally{batch.remove()}}
 fun record(context: Context, event: String, id: Int, target: Long = 0, mode: String = "", detail: String = "") {
  try {
   val item=JSONObject().put("event",event).put("id",id).put("at",System.currentTimeMillis()).put("target",target).put("mode",mode).put("detail",detail)
   val pending=batch.get()
   if(pending!=null)pending.add(item) else append(context,listOf(item))
  }catch(_:Exception){}
 }
 @Synchronized private fun append(context:Context,items:List<JSONObject>){
  val prefs=context.getSharedPreferences("cfh_alarm_diagnostics",Context.MODE_PRIVATE)
  val old=JSONArray(prefs.getString("events","[]"));val events=ArrayList<JSONObject>()
  for(i in 0 until old.length())events.add(old.getJSONObject(i))
  events.addAll(items);events.sortBy { it.optLong("at") }
  val next=JSONArray();for(item in events.takeLast(1000))next.put(item)
  val edit=prefs.edit().putString("events",next.toString())
  if(items.all{it.optString("event")=="scheduled"||it.optString("event")=="cancelled"})edit.apply() else edit.commit()
 }
}
