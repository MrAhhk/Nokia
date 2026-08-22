package com.nokialauncher;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Routes Play Store/app-icon launches into the real HOME task.
 *
 * Keeping CATEGORY_LAUNCHER on MainActivity lets some Android variants create
 * a second, standard task beside the system Home task. Each task owns a full
 * Capacitor WebView, which caused blank surfaces and severe resume/input jank.
 */
public final class LauncherEntryActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setClass(this, MainActivity.class);
        homeIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        startActivity(homeIntent);
        finishAndRemoveTask();
        overridePendingTransition(0, 0);
    }
}
