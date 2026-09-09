package com.nokialauncher;

import android.accessibilityservice.AccessibilityService;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;

/**
 * Provides global hardware-key actions for Nokia Launcher:
 * - GLOBAL_ACTION_RECENTS: Open Android Recent Apps (3-bar overview) when green key is pressed in non-dial views.
 * - GLOBAL_ACTION_LOCK_SCREEN: Turn off screen / sleep immediately when red key is long-pressed.
 */
public class NokiaAccessibilityService extends AccessibilityService {

    private static NokiaAccessibilityService activeInstance;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        activeInstance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // No event inspection needed; used exclusively for performGlobalAction.
    }

    @Override
    public void onInterrupt() {
        // No-op
    }

    @Override
    public void onDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onDestroy();
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
