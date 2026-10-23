package com.vergel.cashflowhub;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle savedInstanceState) {
  registerPlugin(ReminderDiagnosticsPlugin.class);
  super.onCreate(savedInstanceState);
  getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
   private boolean checking = false;
   @Override public void handleOnBackPressed() {
    if (checking || getBridge() == null || getBridge().getWebView() == null) return;
    checking = true;
    getBridge().getWebView().evaluateJavascript(
     "typeof window.cfhHandleAppBack === 'function' ? (window.cfhHandleAppBack() ? 'handled' : 'root') : 'loading'",
     result -> { checking = false; if ("\"root\"".equals(result)) moveTaskToBack(true); }
    );
   }
  });
 }
}
