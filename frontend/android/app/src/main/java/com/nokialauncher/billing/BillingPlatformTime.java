package com.nokialauncher.billing;

import android.content.Context;
import android.os.Build;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;

/** Device uptime/boot identity only, never server time or a store transaction revision.
 * Initialize once on the billing worker; do not query Settings on every snapshot/Home/key event.
 */
public final class BillingPlatformTime implements BillingController.Time {
    private final String bootToken;

    public BillingPlatformTime(Context context) {
        if (Looper.myLooper() == Looper.getMainLooper())
            throw new IllegalStateException("Initialize billing time off the main thread");
        String knownBoot = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                int count = Settings.Global.getInt(context.getApplicationContext().getContentResolver(),
                        Settings.Global.BOOT_COUNT);
                if (count >= 0) knownBoot = "android-boot-count:" + count;
            } catch (Settings.SettingNotFoundException | SecurityException unavailable) {
                // Unknown boot identity must require online verification for cached subscription rights.
            }
        }
        bootToken = knownBoot;
    }

    @Override public String bootToken() { return bootToken; }
    @Override public long elapsedRealtimeMs() { return SystemClock.elapsedRealtime(); }
}
