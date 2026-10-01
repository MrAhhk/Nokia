package com.nokialauncher;

import android.annotation.TargetApi;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private boolean rendererRecoveryStarted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherAppsPlugin.class);
        registerPlugin(PlayIntegrityPlugin.class);
        sanitizeIntent(getIntent());
        super.onCreate(savedInstanceState);
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.getSettings().setAllowContentAccess(true);
            webView.getSettings().setAllowFileAccess(true);
            // Draw the same lightweight surface inside the WebView itself while
            // Chromium restores after a long background interval. Using a
            // drawable avoids a transparent hardware surface and its extra
            // compositing cost while preventing an opaque black first frame.
            webView.setBackgroundResource(R.drawable.launcher_window_background);
        }
        installRecoveringWebViewClient();
        configureImmersiveWindow();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) configureImmersiveWindow();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureImmersiveWindow();
    }

    /**
     * Let the launcher occupy the complete display, including the regions
     * normally reserved for the status and navigation bars. The React shell
     * already owns the full window, so this keeps the physical handset frame
     * continuous instead of leaving black system-bar bands above and below it.
     */
    private void configureImmersiveWindow() {
        // Apply fullscreen at the window level as well as through insets. This
        // prevents the status-bar height from remaining as a top content inset
        // when the Capacitor bridge/splash theme is recreated.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            // AndroidX WindowCompat also retains this stable-layout flag on
            // Android 11-14. Keep the Home viewport stable when system bars
            // become visible; the bars overlay the handset instead of moving
            // its keypad. Child insets and the IME's own window policy remain intact.
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                decorView.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
            getWindow().setDecorFitsSystemWindows(false);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                getWindow().setStatusBarContrastEnforced(false);
                getWindow().setNavigationBarContrastEnforced(false);
            }
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        sanitizeIntent(intent);
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.hasCategory(Intent.CATEGORY_HOME)) {
            dispatchHomeRequest();
        }
    }

    private void dispatchHomeRequest() {
        if (rendererRecoveryStarted || bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();
        webView.post(() -> {
            if (rendererRecoveryStarted || bridge == null || bridge.getWebView() != webView) return;
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('nokia-home-request'));",
                null
            );
        });
    }

    @TargetApi(Build.VERSION_CODES.O)
    private void installRecoveringWebViewClient() {
        if (bridge == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (rendererRecoveryStarted) return true;
                rendererRecoveryStarted = true;

                ViewParent parent = view.getParent();
                if (parent instanceof ViewGroup) {
                    ((ViewGroup) parent).removeView(view);
                }

                View decorView = getWindow().getDecorView();
                decorView.post(() -> {
                    if (!isFinishing() && !isDestroyed()) recreate();
                });
                return true;
            }
        });
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
