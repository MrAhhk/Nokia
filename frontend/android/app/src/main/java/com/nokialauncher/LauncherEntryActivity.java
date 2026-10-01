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
        // An explicit component from a normal app is classified as STANDARD,
        // even with CATEGORY_HOME. Resolve HOME inside our own package so icon
        // launches and the system Home action share the same task type.
        homeIntent.setPackage(getPackageName());
        homeIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        startActivity(homeIntent);
        // On a first icon launch, Home can join this task. Removing the task
        // also removes the Home we just opened. Finish only the trampoline.
        finish();
        overridePendingTransition(0, 0);
    }
}
