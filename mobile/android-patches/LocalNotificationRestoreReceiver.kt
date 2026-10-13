package com.capacitorjs.plugins.localnotifications
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager
class LocalNotificationRestoreReceiver : BroadcastReceiver() {
 override fun onReceive(context: Context, intent: Intent) {
  val user=context.getSystemService(UserManager::class.java)
  if(user==null||!user.isUserUnlocked)return
  CfhAlarmJournal.record(context,"boot-received",-1,detail=intent.action ?: "unknown")
  try {
   val scheduler=context.getSystemService(JobScheduler::class.java)
   val job=JobInfo.Builder(734201,ComponentName(context,CfhReminderRestoreJob::class.java))
    .setOverrideDeadline(0).build()
   val accepted=scheduler.schedule(job)==JobScheduler.RESULT_SUCCESS
   CfhAlarmJournal.record(context,if(accepted) "restore-queued" else "restore-queue-failed",-1)
  }catch(e:Exception){CfhAlarmJournal.record(context,"restore-queue-failed",-1,detail=e.javaClass.simpleName)}
 }
}
