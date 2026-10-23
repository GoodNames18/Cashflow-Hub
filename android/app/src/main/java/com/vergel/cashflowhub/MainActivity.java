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
    if (checking) return;
    if (getBridge() == null || getBridge().getWebView() == null) { passBack(); return; }
    checking = true;
    getBridge().getWebView().evaluateJavascript(
     "Boolean(window.cfhHandleNotesBack && window.cfhHandleNotesBack()) || Boolean(window.cfhHandleManageMoneyBack && window.cfhHandleManageMoneyBack())",
     handled -> { checking = false; if (!"true".equals(handled)) passBack(); }
    );
   }
   private void passBack() {
    setEnabled(false);
    try { getOnBackPressedDispatcher().onBackPressed(); }
    finally { setEnabled(true); }
   }
  });
 }
}
