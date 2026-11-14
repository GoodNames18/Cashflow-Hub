package com.vergel.cashflowhub;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "CalendarExport")
public class CalendarExportPlugin extends Plugin {
 @PluginMethod
 public void save(PluginCall call) {
  String content = call.getString("content");
  if (content == null || content.length() > 1000000 || !content.startsWith("BEGIN:VCALENDAR\r\n")) {
   call.reject("Invalid calendar export");
   return;
  }
  Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
  intent.addCategory(Intent.CATEGORY_OPENABLE);
  intent.setType("text/calendar");
  intent.putExtra(Intent.EXTRA_TITLE, "Cashflow-Hub-Card-Due-Dates.ics");
  startActivityForResult(call, intent, "writeCalendar");
 }

 @ActivityCallback
 private void writeCalendar(PluginCall call, ActivityResult result) {
  if (call == null) return;
  Intent data = result.getData();
  Uri uri = data == null ? null : data.getData();
  if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
   call.resolve(new JSObject().put("saved", false));
   return;
  }
  try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
   if (stream == null) throw new IOException("Could not open destination");
   stream.write(call.getString("content").getBytes(StandardCharsets.UTF_8));
  } catch (IOException | SecurityException e) {
   call.reject("Could not save calendar file", e);
   return;
  }
  call.resolve(new JSObject().put("saved", true));
 }
}
