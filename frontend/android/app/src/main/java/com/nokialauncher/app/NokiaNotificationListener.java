package com.nokialauncher;

import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public class NokiaNotificationListener extends NotificationListenerService {
    private static volatile int activeNotificationCount = 0;

    @Override
    public void onListenerConnected() {
        refreshCount();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        refreshCount();
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification notification) {
        refreshCount();
    }

    @Override
    public void onListenerDisconnected() {
        activeNotificationCount = 0;
    }

    private void refreshCount() {
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            activeNotificationCount = notifications == null ? 0 : notifications.length;
        } catch (SecurityException ignored) {
            activeNotificationCount = 0;
        }
    }

    public static int getActiveNotificationCount() {
        return activeNotificationCount;
    }

    public static boolean hasAccess(Context context) {
        String enabled = Settings.Secure.getString(
            context.getContentResolver(),
            "enabled_notification_listeners"
        );
        if (enabled == null) return false;
        ComponentName component = new ComponentName(context, NokiaNotificationListener.class);
        return enabled.contains(component.flattenToString());
    }
}
