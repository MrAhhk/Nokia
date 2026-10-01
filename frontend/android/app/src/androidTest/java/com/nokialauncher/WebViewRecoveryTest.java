package com.nokialauncher;

import android.os.Build;
import android.webkit.WebView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertNull;
import static org.junit.Assume.assumeTrue;

/** Run in a fresh instrumentation process; disabling WebView is test-only. */
@RunWith(AndroidJUnit4.class)
public class WebViewRecoveryTest {
    @Test
    public void unavailableWebViewSurvivesRecreationRestartAndDetach() {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.P);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(WebView::disableWebView);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertNull(activity.getBridge()));
            // Recreation saves state and detaches the old window with no bridge.
            scenario.recreate();
            scenario.onActivity(activity -> assertNull(activity.getBridge()));
            // Stop/start exercises onRestart; close() detaches the last window.
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(activity -> assertNull(activity.getBridge()));
        }
    }
}
