package com.nokialauncher;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.view.View;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;

/**
 * Provides global hardware-key actions for Nokia Launcher:
 * - GLOBAL_ACTION_RECENTS: Open Android Recent Apps (3-bar overview) when green key is pressed in non-dial views.
 * - GLOBAL_ACTION_LOCK_SCREEN: Turn off screen / sleep immediately when red key is long-pressed.
 */
public class NokiaAccessibilityService extends AccessibilityService {

    private static volatile NokiaAccessibilityService activeInstance;
    private static volatile NokiaAccessibilityService connectedInstance;
    private com.nokialauncher.dumbmode.DumbModeController dumbMode;
    private String lastBlockedPackage;
    private long lastRedirectAt;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        connectedInstance = this;
        dumbMode = com.nokialauncher.dumbmode.DumbModeController.get(this);
        activeInstance = AccessibilityConsent.hasConsent(this) ? this : null;
        dumbMode.availabilityChanged();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (activeInstance != this || event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || dumbMode == null || event.getPackageName() == null) return;
        String packageName = event.getPackageName().toString();
        if (!dumbMode.isBlocked(packageName)) {
            if (getPackageName().equals(packageName)) lastBlockedPackage = null;
            return;
        }
        long now = android.os.SystemClock.elapsedRealtime();
        if (packageName.equals(lastBlockedPackage) && now - lastRedirectAt < 1000) return;
        lastBlockedPackage = packageName;
        lastRedirectAt = now;
        performGlobalAction(GLOBAL_ACTION_HOME);
    }

    @Override
    public void onInterrupt() {
        if (dumbMode != null) dumbMode.availabilityChanged();
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        if (activeInstance == this) activeInstance = null;
        if (connectedInstance == this) connectedInstance = null;
        if (dumbMode != null) dumbMode.availabilityChanged();
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        if (connectedInstance == this) connectedInstance = null;
        if (activeInstance == this) {
            activeInstance = null;
        }
        if (dumbMode != null) dumbMode.availabilityChanged();
        super.onDestroy();
    }

    public static boolean isAvailable() {
        return activeInstance != null;
    }

    static void refreshConsent() {
        NokiaAccessibilityService service = connectedInstance;
        if (service == null) return;
        activeInstance = AccessibilityConsent.hasConsent(service) ? service : null;
        if (service.dumbMode != null) service.dumbMode.availabilityChanged();
    }

    public static boolean openRecentApps() {
        NokiaAccessibilityService service = activeInstance;
        if (service != null) {
            return service.performGlobalAction(GLOBAL_ACTION_RECENTS);
        }
        return false;
    }

    public static boolean lockScreen() {
        NokiaAccessibilityService service = activeInstance;
        if (service != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return service.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
        }
        return false;
    }

    /**
     * Best-effort cross-app Nokia navigation. Editors keep native KeyEvents so
     * LEFT/RIGHT continue to move the caret; non-editor screens use the
     * accessibility focus tree that touch-first apps commonly expose.
     */
    public static boolean navigate(String direction) {
        NokiaAccessibilityService service = activeInstance;
        return service != null && service.navigateInternal(direction);
    }

    private boolean navigateInternal(String direction) {
        if ("BACK".equals(direction)) {
            return performGlobalAction(GLOBAL_ACTION_BACK);
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return dispatchScrollGesture(direction);

        AccessibilityNodeInfo inputFocus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (inputFocus != null && inputFocus.isEditable()) {
            return false;
        }

        AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
        if (focused == null) focused = inputFocus;

        if ("SELECT".equals(direction)) {
            return clickNearest(focused);
        }

        // Nokia grammar is intentionally asymmetric: vertical directions
        // scroll content, while horizontal directions move spatial focus.
        // Some touch-first apps accept accessibility focus without drawing or
        // scrolling it, so focusSearch must never consume UP/DOWN first.
        if ("UP".equals(direction) || "DOWN".equals(direction)) {
            int scrollAction = "UP".equals(direction)
                ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
            if (scrollNearest(focused, root, scrollAction)) return true;
            return dispatchScrollGesture(direction);
        }

        int focusDirection = resolveFocusDirection(direction);
        AccessibilityNodeInfo target = focused == null ? null : focused.focusSearch(focusDirection);
        if (target == null) target = root.focusSearch(focusDirection);
        if (target != null && focusNode(target)) return true;

        int scrollAction = "LEFT".equals(direction)
            ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
        return scrollNearest(focused, root, scrollAction);
    }

    private static int resolveFocusDirection(String direction) {
        if ("UP".equals(direction)) return View.FOCUS_UP;
        if ("DOWN".equals(direction)) return View.FOCUS_DOWN;
        if ("LEFT".equals(direction)) return View.FOCUS_LEFT;
        return View.FOCUS_RIGHT;
    }

    private static boolean focusNode(AccessibilityNodeInfo node) {
        return node.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
            || node.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
    }

    private static boolean clickNearest(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        for (int depth = 0; current != null && depth < 8; depth++) {
            if (current.isClickable() && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true;
            }
            current = current.getParent();
        }
        return false;
    }

    private static boolean scrollNearest(
        AccessibilityNodeInfo focused,
        AccessibilityNodeInfo root,
        int action
    ) {
        AccessibilityNodeInfo current = focused;
        for (int depth = 0; current != null && depth < 8; depth++) {
            if (current.isScrollable() && current.performAction(action)) return true;
            current = current.getParent();
        }

        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited++ < 80) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (node.isScrollable() && node.performAction(action)) return true;
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return false;
    }

    private boolean dispatchScrollGesture(String direction) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N
            || (!"UP".equals(direction) && !"DOWN".equals(direction))) return false;

        float width = getResources().getDisplayMetrics().widthPixels;
        float height = getResources().getDisplayMetrics().heightPixels;
        float startY = "DOWN".equals(direction) ? height * 0.50f : height * 0.24f;
        float endY = "DOWN".equals(direction) ? height * 0.24f : height * 0.50f;
        Path path = new Path();
        path.moveTo(width * 0.50f, startY);
        path.lineTo(width * 0.50f, endY);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, 140))
            .build();
        return dispatchGesture(gesture, null, null);
    }
}
