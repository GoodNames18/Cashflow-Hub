package com.capacitorjs.plugins.localnotifications
import android.app.job.JobService
import android.app.job.JobParameters
import android.os.Handler
import android.os.Looper
import android.os.UserManager
import com.getcapacitor.CapConfig
import java.util.concurrent.atomic.AtomicBoolean
class CfhReminderRestoreJob : JobService() {
 private var stopped=AtomicBoolean(false)
 override fun onStartJob(params: JobParameters): Boolean {
  val stop=AtomicBoolean(false);stopped=stop
  Thread({
   var retry=false
   try {
    if(!getSystemService(UserManager::class.java).isUserUnlocked)throw IllegalStateException("Device locked")
    CfhAlarmJournal.record(this,"restore-started",-1)
    val storage=NotificationStorage(this)
    val now=System.currentTimeMillis()
    val saved=storage.getSavedNotifications()
    val ordered=saved.filter { CfhRestorePolicy.eligible(it.cancelled,it.schedule?.isPerpetual() ?: false,it.schedule?.at?.time,now) }
     .sortedBy { CfhRestorePolicy.priority(it.schedule?.at?.time) }
    val manager=LocalNotificationManager(storage,null,this,CapConfig.loadDefault(this))
    var restored=0
    CfhAlarmJournal.beginBatch()
    try {
     for(notification in ordered){
      if(stop.get())break
      // Re-read before restoring so a deletion or edit during restoration wins.
      val current=notification.id?.let { storage.getSavedNotification(it.toString()) } ?: continue
      if(!CfhRestorePolicy.eligible(current.cancelled,current.schedule?.isPerpetual() ?: false,current.schedule?.at?.time,System.currentTimeMillis()))continue
      val ids=manager.schedule(null,listOf(current)) ?: throw IllegalStateException("Notifications blocked")
      restored+=ids.length()
      if(restored%20==0){CfhAlarmJournal.flushBatch(this);CfhAlarmJournal.record(this,"restore-progress",-1,detail="$restored/${ordered.size}")}
     }
    }finally{CfhAlarmJournal.endBatch(this)}
    if(!stop.get())CfhAlarmJournal.record(this,"restore-completed",-1,detail="$restored reminders; ${saved.size-ordered.size} past or cancelled skipped")
   }catch(e:Exception){retry=true;CfhAlarmJournal.record(this,"restore-failed",-1,detail=e.javaClass.simpleName+": "+(e.message ?: ""))}
   finally{Handler(Looper.getMainLooper()).post { if(!stop.get())jobFinished(params,retry) }}
  },"cfh-restore").start()
  return true
 }
 override fun onStopJob(params: JobParameters): Boolean {
  stopped.set(true);CfhAlarmJournal.record(this,"restore-stopped",-1,detail="Android requested stop; retry queued")
  return true
 }
}
