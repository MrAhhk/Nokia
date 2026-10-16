package com.nokialauncher;

import android.app.Activity;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** Native gate: unconsented requests hand off to the existing Home notice. */
final class AccessibilityConsent {
    static final String STORE = "nokia_accessibility_consent";
    static final int VERSION = 1;

    static boolean hasConsent(Context context) {
        return context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getInt("version", 0) == VERSION;
    }

    static void accept(Context context) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putInt("version", VERSION).apply();
        NokiaAccessibilityService.refreshConsent();
    }

    void request(Activity activity, PluginCall call, Runnable proceed) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("accessibility_host_unavailable");
            return;
        }
        if (hasConsent(activity)) { proceed.run(); return; }
        JSObject result = new JSObject();
        result.put("opened", false);
        result.put("needsDisclosure", true);
        call.resolve(result);
    }
}
