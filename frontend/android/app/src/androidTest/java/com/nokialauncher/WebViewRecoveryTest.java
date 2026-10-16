package com.nokialauncher;

import android.os.Build;
import android.webkit.WebView;
import android.graphics.Bitmap;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import com.nokialauncher.billing.BillingRecoveryView;
import java.io.File;
import java.io.FileOutputStream;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

/** Run in a fresh instrumentation process; disabling WebView is test-only. */
@RunWith(AndroidJUnit4.class)
public class WebViewRecoveryTest {
    @Test
    public void unavailableWebViewSurvivesRecreationRestartAndDetach() throws Exception {
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
            scenario.onActivity(activity -> {
                assertNull(activity.getBridge());
                ViewGroup root = activity.findViewById(android.R.id.content);
                assertTrue(root.getChildAt(0) instanceof BillingRecoveryView);
                assertEquals(4, checkActions(root));
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            // RESUMED/layout can precede the vendor's window transition. Wait
            // for UI events to settle before capturing visual evidence.
            InstrumentationRegistry.getInstrumentation().getUiAutomation().waitForIdle(1000, 5000);
            Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            assertTrue(screenshot != null);
            File output = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-billing-recovery.png");
            try (FileOutputStream stream = new FileOutputStream(output)) {
                assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream));
            } finally { screenshot.recycle(); }
        }
    }

    private int checkActions(View view) {
        if (view instanceof Button) {
            Button button = (Button) view;
            assertTrue(button.isEnabled());
            assertTrue(button.hasOnClickListeners());
            assertTrue(button.getHeight() >= Math.round(48 * button.getResources().getDisplayMetrics().density));
            assertTrue(button.getLayout().getEllipsisCount(0) == 0);
            return 1;
        }
        int count = 0;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) count += checkActions(group.getChildAt(index));
        }
        return count;
    }
}
