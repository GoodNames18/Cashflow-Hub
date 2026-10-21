package com.capacitorjs.plugins.localnotifications

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import org.json.JSONObject

/** One AlarmManager wake-up can deliver several independent reminder cards. */
object CfhReminderNotifications {
    fun expand(context: Context, original: Notification, source: JSONObject?, parentId: Int): List<Pair<Int, Notification>> {
        val items = source?.optJSONObject("extra")?.optJSONArray("cfhItems")
        if (items == null || items.length() < 2) return listOf(parentId to original)
        val result = mutableListOf<Pair<Int, Notification>>()
        val used = mutableSetOf<Int>()
        val usedContent = mutableSetOf<Pair<String, String>>()
        for (index in 0 until items.length()) {
            val item = items.optJSONObject(index) ?: continue
            val id = item.optInt("id", 0)
            if (id >= 0 || !used.add(id)) continue
            val title = item.optString("title")
            val body = item.optString("body")
            if (!usedContent.add(title to body)) continue
            val dismiss = Intent(context, NotificationDismissReceiver::class.java)
                .putExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, parentId)
                .putExtra("cfh_display_id", id)
                .putExtra(LocalNotificationManager.ACTION_INTENT_KEY, "dismiss")
            val deleteIntent = PendingIntent.getBroadcast(context, id, dismiss,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            // recoverBuilder shares extras with its input; each child needs its own bundle.
            val isolated = original.clone()
            isolated.extras = Bundle(original.extras)
            val child = Notification.Builder.recoverBuilder(context, isolated)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setGroup(null)
                .setGroupSummary(false)
                .setDeleteIntent(deleteIntent)
                .build()
            result.add(id to child)
        }
        return result.ifEmpty { listOf(parentId to original) }
    }
}
