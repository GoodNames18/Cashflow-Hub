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

@CapacitorPlugin(name = "CalendarExport",permissions={
 @com.getcapacitor.annotation.Permission(alias="legacyPhotos",strings={android.Manifest.permission.WRITE_EXTERNAL_STORAGE})
})
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

 @PluginMethod
 public void saveImage(PluginCall call) {
  String content=call.getString("content");
  if(content==null||content.length()<12||content.length()>24000000){call.reject("Invalid or oversized image");return;}
  if(android.os.Build.VERSION.SDK_INT<29&&getPermissionState("legacyPhotos")!=com.getcapacitor.PermissionState.GRANTED){
   requestPermissionForAlias("legacyPhotos",call,"imagePermission");return;
  }
  // Never retain image bytes in an activity result or Android saved state.
  call.getData().remove("content");
  new Thread(()->writeGalleryImage(call,content),"cfh-note-image").start();
 }
 @com.getcapacitor.annotation.PermissionCallback
 private void imagePermission(PluginCall call) {
  if(getPermissionState("legacyPhotos")==com.getcapacitor.PermissionState.GRANTED)saveImage(call);
  else call.reject("Allow photo storage to save the note image");
 }
 private void writeGalleryImage(PluginCall call,String content) {
  Uri uri=null;java.io.File legacyFile=null;
  android.content.ContentResolver resolver=getContext().getContentResolver();
  try(android.util.Base64InputStream input=new android.util.Base64InputStream(
    new java.io.ByteArrayInputStream(content.getBytes(StandardCharsets.US_ASCII)),android.util.Base64.DEFAULT)){
   byte[] header=new byte[8];int filled=0;
   while(filled<8){int size=input.read(header,filled,8-filled);if(size<0)throw new IOException("Image was empty");filled+=size;}
   if(!java.util.Arrays.equals(header,new byte[]{(byte)137,80,78,71,13,10,26,10}))throw new IOException("Image is empty or invalid");
   String requested=call.getString("fileName","Note.png");
   String name=requested.replaceAll("[^a-zA-Z0-9 _.-]","_").replaceFirst("(?i)\\.png$","");
   name=name.substring(0,Math.min(name.length(),70))+"-"+System.currentTimeMillis()+".png";
   OutputStream destination;
   if(android.os.Build.VERSION.SDK_INT>=29){
    android.content.ContentValues values=new android.content.ContentValues();
    values.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME,name);
    values.put(android.provider.MediaStore.Images.Media.MIME_TYPE,"image/png");
    values.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,android.os.Environment.DIRECTORY_PICTURES+"/Cashflow Hub");
    values.put(android.provider.MediaStore.Images.Media.IS_PENDING,1);
    uri=resolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
    if(uri==null)throw new IOException("Could not create image");
    destination=resolver.openOutputStream(uri,"w");
   }else{
    java.io.File folder=new java.io.File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES),"Cashflow Hub");
    if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("Could not create Pictures folder");
    legacyFile=new java.io.File(folder,name);destination=new java.io.FileOutputStream(legacyFile);
   }
   long count=8;
   try(OutputStream stream=destination){
    if(stream==null)throw new IOException("Could not open image");
    stream.write(header);byte[] buffer=new byte[32768];int size;
    while((size=input.read(buffer))!=-1){stream.write(buffer,0,size);count+=size;}
    if(count<=8)throw new IOException("Image was empty");stream.flush();
   }
   if(android.os.Build.VERSION.SDK_INT>=29){
    android.content.ContentValues values=new android.content.ContentValues();values.put(android.provider.MediaStore.Images.Media.IS_PENDING,0);
    if(resolver.update(uri,values,null,null)!=1)throw new IOException("Could not publish image");
   }else android.media.MediaScannerConnection.scanFile(getContext(),new String[]{legacyFile.getAbsolutePath()},new String[]{"image/png"},null);
   call.resolve(new JSObject().put("saved",true).put("bytes",count).put("location","Pictures/Cashflow Hub"));
  }catch(Exception error){
   if(uri!=null)try{resolver.delete(uri,null,null);}catch(Exception ignored){}
   if(legacyFile!=null)legacyFile.delete();
   call.reject("Could not save note image. Check free storage.",error);
  }
 }
 @PluginMethod
 public void shareNote(PluginCall call) {
  String text=call.getString("text","");
  if(text.length()>100000){call.reject("Note text is too large to share");return;}
  Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");
  send.putExtra(Intent.EXTRA_SUBJECT,call.getString("title","Note"));send.putExtra(Intent.EXTRA_TEXT,text);
  getActivity().runOnUiThread(()->{
   try{getActivity().startActivity(Intent.createChooser(send,"Send note"));call.resolve(new JSObject().put("opened",true));}
   catch(Exception error){call.reject("Could not open sharing",error);}
  });
 }
}
