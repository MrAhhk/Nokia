package com.nokialauncher;

import android.annotation.TargetApi;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.PluginHandle;
import com.nokialauncher.billing.BillingRecoveryView;
import com.nokialauncher.billing.BillingShellReadiness;

public class MainActivity extends BridgeActivity {
    private final BillingShellReadiness shellReadiness = new BillingShellReadiness();
    private final Handler shellHandler = new Handler(Looper.getMainLooper());
    private BillingRecoveryView recoveryView;
    private final Runnable bootDeadline = () -> {
        if (!isFinishing() && !isDestroyed() && shellReadiness.deadline()) showNativeRecovery();
    };

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
        boolean bridgePresent = bridge != null && bridge.getWebView() != null;
        if (shellReadiness.start(BuildConfig.BILLING_ROLLOUT_ENABLED, bridgePresent)) {
            shellHandler.postDelayed(bootDeadline, BillingShellReadiness.BOOT_DEADLINE_MS);
        } else if (shellReadiness.isRecovery()) {
            showNativeRecovery();
        }
    }

    /** Called by the packaged-shell PluginMethod on the UI thread, with its native WebView. */
    public boolean markPackagedShellReady(WebView source) {
        if (!permitsPackagedShell(source) || !shellReadiness.ready(source.getUrl(), true)) return false;
        shellHandler.removeCallbacks(bootDeadline);
        return true;
    }

    /** Main-thread authority check for every native command from the current packaged Home. */
    public boolean permitsPackagedShell(WebView source) {
        if (Looper.myLooper() != Looper.getMainLooper() || isFinishing() || isDestroyed()) return false;
        boolean sameWebView = source != null && bridge != null && bridge.getWebView() == source;
        return shellReadiness.permits(sameWebView ? source.getUrl() : null, sameWebView);
    }

    private void showNativeRecovery() {
        shellHandler.removeCallbacks(bootDeadline);
        if (recoveryView != null || isFinishing() || isDestroyed()) return;
        // Existing instance only: this lookup must never initialize a plugin, SDK or storage.
        PluginHandle plugin = bridge == null ? null : bridge.getPlugin("LauncherApps");
        if (plugin != null && plugin.getInstance() instanceof LauncherAppsPlugin) {
            ((LauncherAppsPlugin) plugin.getInstance()).enterNativeRecovery();
        }
        recoveryView = new BillingRecoveryView(this);
        // Replace this Activity's content only. A call/settings Activity above Home stays above it.
        setContentView(recoveryView);
    }

    @Override
    public void onDestroy() {
        shellHandler.removeCallbacks(bootDeadline);
        shellReadiness.destroy();
        recoveryView = null;
        super.onDestroy();
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
        WindowCompat.enableEdgeToEdge(getWindow());
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
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
        if (shellReadiness.isRecovery() || bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();
        webView.post(() -> {
            if (shellReadiness.isRecovery() || bridge == null || bridge.getWebView() != webView) return;
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
                ViewParent parent = view.getParent();
                if (parent instanceof ViewGroup) {
                    ((ViewGroup) parent).removeView(view);
                }
                view.destroy();
                if (shellReadiness.rendererGone()) showNativeRecovery();
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
