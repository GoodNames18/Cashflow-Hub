import {readFile,writeFile,copyFile} from 'node:fs/promises';
const root='node_modules/@capacitor/local-notifications/android/src/main/kotlin/com/capacitorjs/plugins/localnotifications/';
async function patch(file,edits){let s=await readFile(root+file,'utf8');if(s.includes('// CFH alarm diagnostics v2'))return;for(const [before,after]of edits){if(!s.includes(before))throw Error('Pinned notification source changed: '+file);s=s.replace(before,after)}await writeFile(root+file,s+'\n// CFH alarm diagnostics v2\n')}
await copyFile('mobile/android-patches/CfhAlarmJournal.kt',root+'CfhAlarmJournal.kt');
await patch('LocalNotificationManager.kt',[
 ['notificationIntent.putExtra(NOTIFICATION_INTENT_KEY, requestId)','notificationIntent.putExtra(NOTIFICATION_INTENT_KEY, requestId)\n        notificationIntent.putExtra("cfh_target", schedule.at?.time ?: 0L)'],
 ['        if (useExact) {\n            if (schedule.allowWhileIdle()) {',`        val alarmMode=context.getSharedPreferences("cfh_alarm_diagnostics", Context.MODE_PRIVATE).getBoolean("alarmClock",false)
        if (useExact && alarmMode) {
            val launch=context.packageManager.getLaunchIntentForPackage(context.packageName)
            val show=if(launch!=null) PendingIntent.getActivity(context,0,launch,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) else null
            alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(trigger,show),pendingIntent)
        } else if (useExact) {
            if (schedule.allowWhileIdle()) {`],
 ['    /** Whether the app can currently schedule exact alarms.',`    /** Whether the app can currently schedule exact alarms.`],
 ['        }\n    }\n\n    /** Whether the app can currently schedule exact alarms.',`        }
        CfhAlarmJournal.record(context,"scheduled",localNotification.id ?: -1,trigger,if(useExact && alarmMode) "alarm-clock" else if(useExact) "exact" else "inexact",localNotification.title ?: "")
    }

    /** Whether the app can currently schedule exact alarms.`],
 ['        val existing = notificationStorage.getSavedNotification(notificationId.toString())','        CfhAlarmJournal.record(context,"tapped",notificationId)\n        val existing = notificationStorage.getSavedNotification(notificationId.toString())'],
 ['        NotificationManagerCompat.from(context).cancel(notificationId)','        if(currentlyVisibleIds().contains(notificationId))CfhAlarmJournal.record(context,"removed-by-app",notificationId)\n        NotificationManagerCompat.from(context).cancel(notificationId)'],
 ['            alarmManager.cancel(pi)','            alarmManager.cancel(pi)\n            CfhAlarmJournal.record(context,"cancelled",notificationId)']
]);
await patch('TimedNotificationPublisher.kt',[
 ['        val notificationManager =',`        val cfhId=intent.getIntExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY,-1)
        val cfhTarget=intent.getLongExtra("cfh_target",0L)
        CfhAlarmJournal.record(context,"fired",cfhId,cfhTarget)
        val notificationManager =`],
 ['        if (notification == null) return','        if (notification == null) { CfhAlarmJournal.record(context,"missing-payload",cfhId,cfhTarget); return }'],
 ['        notificationManager.notify(id, notification)',`        try {
            val channel=if(Build.VERSION.SDK_INT>=26) notificationManager.getNotificationChannel(notification.channelId) else null
            val allowed=notificationManager.areNotificationsEnabled() && (channel==null || channel.importance!=NotificationManager.IMPORTANCE_NONE)
            notificationManager.notify(id, notification)
            CfhAlarmJournal.record(context,if(allowed) "posted" else "blocked",id,cfhTarget)
        } catch(e:Exception) { CfhAlarmJournal.record(context,"post-error",id,cfhTarget,detail=e.javaClass.simpleName) }`]
]);
await patch('NotificationDismissReceiver.kt',[[
 '        val storage = NotificationStorage(context)',
 '        CfhAlarmJournal.record(context,"dismissed",intExtra)\n        val storage = NotificationStorage(context)'
]]);
console.log('Native alarm diagnostics and optional alarm-clock mode installed');
