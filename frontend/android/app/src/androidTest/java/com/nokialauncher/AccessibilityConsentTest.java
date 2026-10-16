package com.nokialauncher;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Unconsented native requests return a Home handoff, never an Android dialog. */
@RunWith(AndroidJUnit4.class)
public class AccessibilityConsentTest {
    private static final class ResultCall extends PluginCall {
        JSObject result;
        int completions;
        ResultCall() { super(null, "LauncherApps", "consent-test", "showAccessibilitySettings", new JSObject()); }
        @Override public void resolve(JSObject value) { result = value; completions++; }
    }
    @Test public void missingConsentHandsOffWithoutOpeningSettingsOrGrantingConsent() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assumeTrue("com.nokialauncher.uismoke".equals(context.getPackageName()));
        int original = context.getSharedPreferences(AccessibilityConsent.STORE, 0).getInt("version", 0);
        context.getSharedPreferences(AccessibilityConsent.STORE, 0).edit().clear().commit();
        AccessibilityConsent gate = new AccessibilityConsent();
        AtomicInteger openings = new AtomicInteger();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ResultCall request = new ResultCall();
            scenario.onActivity(activity -> gate.request(activity, request, openings::incrementAndGet));
            assertEquals(Boolean.TRUE, request.result.getBool("needsDisclosure"));
            assertEquals(1, request.completions);
            assertEquals(0, openings.get());
            assertFalse(AccessibilityConsent.hasConsent(context));
            // Explicit frontend acknowledgement is the only acceptance path.
            scenario.onActivity(activity -> AccessibilityConsent.accept(activity));
            scenario.onActivity(activity -> gate.request(activity, new ResultCall(), openings::incrementAndGet));
            assertEquals(1, openings.get());
        } finally {
            context.getSharedPreferences(AccessibilityConsent.STORE, 0).edit().clear().putInt("version", original).commit();
            AccessibilityConsentTest.refresh(context);
        }
    }
    private static void refresh(Context context) { NokiaAccessibilityService.refreshConsent(); }

    private String js(android.webkit.WebView web, String script) throws Exception {
        java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicReference<String> result = new java.util.concurrent.atomic.AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue(done.await(5, java.util.concurrent.TimeUnit.SECONDS));
        return result.get();
    }

    @Test public void fallbackNoticeRendersInsideHomeAndLaterDismissesIt() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assumeTrue("com.nokialauncher.uismoke".equals(context.getPackageName()));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            java.util.concurrent.atomic.AtomicReference<android.webkit.WebView> host = new java.util.concurrent.atomic.AtomicReference<>();
            scenario.onActivity(activity -> host.set(activity.getBridge().getWebView()));
            android.webkit.WebView web = host.get();
            long deadline = android.os.SystemClock.uptimeMillis() + 15000;
            while (android.os.SystemClock.uptimeMillis() < deadline) {
                if ("true".equals(js(web, "(()=>{Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Skip guide'))?.click();document.querySelector('[data-tone-choice=skip]')?.click();return !!document.querySelector('.lcd-home')})()"))) break;
                android.os.SystemClock.sleep(100);
            }
            assertEquals("true", js(web, "!!document.querySelector('.lcd-home')"));
            js(web, "window.dispatchEvent(new Event('nokia-accessibility-disclosure-request'))");
            deadline = android.os.SystemClock.uptimeMillis() + 5000;
            while (!"true".equals(js(web, "!!document.querySelector('[data-testid=accessibility-home-notice]')")) && android.os.SystemClock.uptimeMillis() < deadline) android.os.SystemClock.sleep(100);
            assertEquals("true", js(web, "!!document.querySelector('.lcd-home [data-testid=accessibility-home-notice]')"));
            assertEquals("true", js(web, "document.querySelector('[data-testid=accessibility-home-notice]').textContent.includes('no screen-history storage or sharing')"));
            js(web, "window.__noticePaintReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__noticePaintReady=true)))");
            deadline = android.os.SystemClock.uptimeMillis() + 5000;
            while (!"true".equals(js(web, "window.__noticePaintReady")) && android.os.SystemClock.uptimeMillis() < deadline) android.os.SystemClock.sleep(100);
            assertEquals("true", js(web, "window.__noticePaintReady"));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            android.graphics.Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(new java.io.File(context.getExternalFilesDir(null), "accessibility-home-notice.png"))) {
                assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
            } finally { screenshot.recycle(); }
            js(web, "document.querySelector('[data-testid=accessibility-home-notice] [data-notice-dismiss]').click()");
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertEquals("false", js(web, "!!document.querySelector('[data-testid=accessibility-home-notice]')"));
        }
    }
}
