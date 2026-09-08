package com.nokialauncher;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;

/**
 * Provides global hardware-key actions for Nokia Launcher:
 * - GLOBAL_ACTION_RECENTS: Open Android Recent Apps (3-bar overview) when green key is pressed in non-dial views.
 * - GLOBAL_ACTION_LOCK_SCREEN: Turn off screen / sleep immediately when red key is long-pressed.
 */
public class NokiaAccessibilityService extends AccessibilityService {

    private static NokiaAccessibilityService activeInstance;
    private NokiaNavigatorOverlayController navigatorOverlay;
    private String activePackage;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        activeInstance = this;
        navigatorOverlay = new NokiaNavigatorOverlayController(this, intent -> {
            // Cross-app actions are connected in the focus-navigation phase.
        });
        refreshNavigationMode();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event != null && event.getPackageName() != null) {
            activePackage = event.getPackageName().toString();
        }
        refreshNavigationMode();
    }

    @Override
    public void onInterrupt() {
        // No-op
    }

    @Override
    public void onDestroy() {
        if (navigatorOverlay != null) {
            navigatorOverlay.destroy();
            navigatorOverlay = null;
        }
        ControlSurfaceCoordinator.setMode(ControlSurfaceMode.HIDDEN);
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onDestroy();
    }

    private void refreshNavigationMode() {
        if (isLandscape() || isKeyguardLocked()) {
            ControlSurfaceCoordinator.setMode(ControlSurfaceMode.HIDDEN);
            return;
        }
        if (getPackageName().equals(activePackage)) {
            ControlSurfaceCoordinator.setMode(ControlSurfaceMode.HIDDEN);
            return;
        }

        ControlSurfaceMode currentMode = ControlSurfaceCoordinator.getMode();
        if (currentMode == ControlSurfaceMode.INPUT_TEXT
                || currentMode == ControlSurfaceMode.INPUT_NUMBER
                || currentMode == ControlSurfaceMode.SECURE) {
            return;
        }
        ControlSurfaceCoordinator.setMode(ControlSurfaceMode.NAVIGATION);
    }

    private boolean isLandscape() {
        return getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
    }

    private boolean isKeyguardLocked() {
        KeyguardManager keyguardManager =
                (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        return keyguardManager != null && keyguardManager.isKeyguardLocked();
    }

    public static boolean isAvailable() {
        return activeInstance != null;
    }

    public static boolean openRecentApps() {
        if (activeInstance != null) {
            return activeInstance.performGlobalAction(GLOBAL_ACTION_RECENTS);
        }
        return false;
    }

    public static boolean lockScreen() {
        if (activeInstance != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return activeInstance.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
        }
        return false;
    }
}
