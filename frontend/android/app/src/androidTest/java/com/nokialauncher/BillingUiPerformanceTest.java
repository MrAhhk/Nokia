package com.nokialauncher;

import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Physical-device offline smoke only: exercises actual packaged controls, no provider. */
@RunWith(AndroidJUnit4.class)
public class BillingUiPerformanceTest {
    private WebView web;
    private String js(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView evaluation timed out", done.await(5, TimeUnit.SECONDS));
        return result.get();
    }
    private void waitFor(String condition) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(js(condition))) return;
            SystemClock.sleep(100);
        }
        fail("UI did not become ready: " + condition);
    }
    @Test public void twentyDirectionsRemainOrderedAndRenderWithoutHeavyEffects() throws Exception {
        assertEquals("This probe requires offline billingSmoke", "com.nokialauncher.billingsmoke", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> web = activity.getBridge().getWebView());
            waitFor("!!document.querySelector('.billing-onboarding, .billing-lcd')");
            js("document.querySelector('.billing-onboarding .onboarding-coach__skip')?.click()");
            // The actual guide's accessible action, independent of its CSS selector.
            js("Array.from(document.querySelectorAll('.billing-onboarding button')).find(b=>b.textContent.includes('Skip guide'))?.click()");
            waitFor("!!document.querySelector('.billing-lcd')");
            int count = Integer.parseInt(js("document.querySelectorAll('.billing-lcd button:not(:disabled), .billing-lcd input:not(:disabled)').length"));
            assertTrue(count >= 5);
            js("window.__billingFrames=[]; document.querySelector('[aria-label=Down]').addEventListener('pointerdown',()=>{let t=performance.now();requestAnimationFrame(()=>window.__billingFrames.push(performance.now()-t))}); Array.from(document.querySelectorAll('.billing-lcd button:not(:disabled), .billing-lcd input:not(:disabled)')).forEach((b,i)=>b.dataset.probeIndex=i)");
            JSONObject point = new JSONObject(js("(()=>{let r=document.querySelector('[aria-label=Down]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth}})()"));
            float scale = web.getWidth() / (float) point.getDouble("width");
            int[] location = new int[2];
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.getLocationOnScreen(location));
            float x = location[0] + (float) point.getDouble("x") * scale;
            float y = location[1] + (float) point.getDouble("y") * scale;
            for (int i=0;i<20;i++) {
                long time=SystemClock.uptimeMillis();
                MotionEvent down=MotionEvent.obtain(time,time,MotionEvent.ACTION_DOWN,x,y,0);
                InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
                SystemClock.sleep(30);
                MotionEvent up=MotionEvent.obtain(time,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);
                InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
                down.recycle(); up.recycle();
                waitFor("document.querySelector('.billing-lcd [data-billing-focused=true]')?.dataset.probeIndex==='"+(i % count)+"'");
                assertEquals("Lost or reordered direction at " + i, "\""+(i % count)+"\"", js("document.querySelector('.billing-lcd [data-billing-focused=true]').dataset.probeIndex"));
            }
            waitFor("window.__billingFrames.length===20");
            JSONArray frames = new JSONArray(js("window.__billingFrames.slice().sort((a,b)=>a-b)"));
            String metrics = "BILLING_UI_FRAME_MS samples=20 ordered=20 p50="+frames.getDouble(9)+" p90="+frames.getDouble(17);
            System.out.println(metrics);
            File evidence = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "billing-ui-performance.txt");
            try (FileOutputStream output = new FileOutputStream(evidence)) { output.write(metrics.getBytes(StandardCharsets.UTF_8)); }
            assertEquals("No expensive effects on billing", "true", js("Array.from(document.querySelectorAll('.billing-lcd,.billing-lcd *')).every(e=>{let s=getComputedStyle(e);return s.filter==='none' && s.backdropFilter==='none'})"));
        }
    }
}
