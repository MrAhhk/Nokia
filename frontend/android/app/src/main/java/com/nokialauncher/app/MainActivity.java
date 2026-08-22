package com.nokialauncher;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherAppsPlugin.class);
        registerPlugin(PlayIntegrityPlugin.class);
        sanitizeIntent(getIntent());
        super.onCreate(savedInstanceState);
        hideSystemStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemStatusBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemStatusBar();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setVisibility(View.VISIBLE);
            bridge.getWebView().setAlpha(1f);
            bridge.getWebView().onResume();
            bridge.getWebView().resumeTimers();
            bridge.getWebView().requestLayout();
            bridge.getWebView().invalidate();
        }
    }

    private void hideSystemStatusBar() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        sanitizeIntent(intent);
        super.onNewIntent(intent);
    }

    private void sanitizeIntent(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String dataString = intent.getData().toString();
            if (dataString.contains("view=keyboard")) {
                String cleanUrl = dataString.replace("view=keyboard", "view=launcher");
                intent.setData(Uri.parse(cleanUrl));
            }
        }
    }
}
