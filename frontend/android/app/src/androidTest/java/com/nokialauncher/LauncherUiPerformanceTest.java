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
public class LauncherUiPerformanceTest {
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
        fail("UI did not become ready: " + condition + " BODY=" + js("document.body.innerText.slice(0,800)"));
    }
    @Test public void twentyDirectionsRemainOrderedAndRenderWithoutHeavyEffects() throws Exception {
        assertEquals("This probe requires offline uiSmoke", "com.nokialauncher.uismoke", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> web = activity.getBridge().getWebView());
            waitFor("!!document.querySelector('.onboarding-coach, .lcd-home')");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Skip guide'))?.click()");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Not now')?.click()");
            waitFor("!!document.querySelector('.lcd-home')");
            // Optional setup appears after asynchronous access discovery. Dismiss only that app-owned prompt.
            waitFor("(()=>{let skip=document.querySelector('[data-tone-choice=skip]');if(skip){skip.click();return false;}let settings=Array.from(document.querySelectorAll('.lcd-home .lcd-softkeys button')).find(b=>b.textContent.trim()==='Settings');if(settings){settings.click();return false;}return document.querySelectorAll('[data-testid=screen-settings] .lcd-list-row').length>=5;})()");
            int count = Integer.parseInt(js("document.querySelectorAll('.lcd-list-row').length"));            assertTrue(count >= 5);
            assertEquals("List rows must not be cards", "true", js("Array.from(document.querySelectorAll('.lcd-list-row')).every(e=>getComputedStyle(e).borderTopWidth==='0px')"));
            js("document.fonts.load('16px VT323').then(()=>window.__pixelReady=true)");
            waitFor("window.__pixelReady===true");
            assertEquals("Pixel heading uses the bundled font", "true", js("getComputedStyle(document.querySelector('.lcd-list-title')).fontFamily.includes('VT323')"));
            assertEquals("Clock is visible", "true", js("/^\\d{2}:\\d{2}$/.test(document.querySelector('.lcd-list-time').textContent)"));
            assertEquals("Softkeys match Home positions", "true", js("Array.from(document.querySelectorAll('.lcd-list-softkeys > *')).every((e,i)=>getComputedStyle(e).textAlign===['left','center','right'][i])"));
            assertEquals("D-pad hit areas do not overlap", "true", js("(()=>{let r=Array.from(document.querySelectorAll('.physical-dpad__hit'),e=>e.getBoundingClientRect());return r.every((a,i)=>r.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<=.1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=.1));})()"));
            js("window.__billingFrames=[]; document.querySelector('[aria-label=Down]').addEventListener('pointerdown',()=>{let t=performance.now();requestAnimationFrame(()=>window.__billingFrames.push(performance.now()-t))}); Array.from(document.querySelectorAll('.lcd-list-row')).forEach((b,i)=>b.dataset.probeIndex=i)");
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
                waitFor("document.querySelector('.lcd-list-row.is-selected')?.dataset.probeIndex==='"+((i+1) % count)+"'");
                assertEquals("Lost or reordered direction at " + i, "\""+((i+1) % count)+"\"", js("document.querySelector('.lcd-list-row.is-selected').dataset.probeIndex"));
            }
            waitFor("window.__billingFrames.length===20");
            JSONArray frames = new JSONArray(js("window.__billingFrames.slice().sort((a,b)=>a-b)"));
            String metrics = "LAUNCHER_UI_FRAME_MS samples=20 ordered=20 p50="+frames.getDouble(9)+" p90="+frames.getDouble(17);
            System.out.println(metrics);
            File evidence = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "launcher-ui-performance.txt");
            try (FileOutputStream output = new FileOutputStream(evidence)) { output.write(metrics.getBytes(StandardCharsets.UTF_8)); }
            assertEquals("No expensive effects on list", "true", js("Array.from(document.querySelectorAll('.lcd-list-screen,.lcd-list-screen *')).every(e=>{let s=getComputedStyle(e);return s.filter==='none' && s.backdropFilter==='none'})"));
            // Check the new Settings route and actual wordmark, restoring the local fixture afterward.
            String originalName = js("localStorage.getItem('nokia-launcher.phone-name.v1') || 'Nokia'");
            js("Array.from(document.querySelectorAll('.lcd-list-row')).find(b=>b.textContent.includes('Phone name')).click()");
            waitFor("!!document.querySelector('#phone-name-input')");
            assertEquals("Name uses keypad only", "true", js("(()=>{let e=document.querySelector('#phone-name-input');e.focus();return e.readOnly && e.inputMode==='none' && document.activeElement!==e})()"));
            js("(()=>{let del=Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Delete');for(let i=0;i<20;i++)del.click()})()");
            waitFor("document.querySelector('#phone-name-input').value===''");
            js("document.querySelector('[data-testid=keypad-btn-2]').click()");
            js("document.querySelector('[data-testid=keypad-btn-3]').click()");
            waitFor("document.querySelector('#phone-name-input').value==='ad'");
            js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Save').click()");
            waitFor("!!document.querySelector('[data-testid=screen-settings]')");
            js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Exit').click()");
            waitFor("!!document.querySelector('.lcd-home')");
            assertEquals("Keypad name reaches the casing", "\"ad\"", js("document.querySelector('.nokia-wordmark').getAttribute('aria-label')"));
            js("localStorage.setItem('nokia-launcher.phone-name.v1'," + originalName + ")");
            js("Array.from(document.querySelectorAll('.lcd-home .lcd-softkeys button')).find(b=>b.textContent==='Settings').click()");
            waitFor("!!document.querySelector('[data-testid=screen-settings]')");
            // Use the real appearance switch; style parity must survive its smaller LCD.
            for (String appearance : new String[]{"sidephone", "nokia"}) {
                js("document.querySelector('.lcd-list-row.is-customization').click()");
                waitFor("!!document.querySelector('[data-testid=screen-customization]')");
                js("document.querySelector('[data-testid=appearance-" + appearance + "]').click()");
                js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Back').click()");
                waitFor("!!document.querySelector('[data-testid=screen-settings]')");
                assertEquals("Same pixel label size and weight in " + appearance, "true", js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).every(e=>{let s=getComputedStyle(e);return s.fontSize==='15px'&&s.fontWeight==='400'})"));
                assertEquals("Scroll ends just above reachable footer in " + appearance, "true", js("(()=>{let body=document.querySelector('.lcd-list').getBoundingClientRect();let footer=document.querySelector('.lcd-list-softkeys').getBoundingClientRect();let gap=footer.top-body.bottom;return gap>=-1&&gap<=10})()"));
            }
            js("Array.from(document.querySelectorAll('.lcd-list-row')).find(b=>b.textContent.trim()==='Font').click()");
            waitFor("!!document.querySelector('[data-testid=screen-font]')");
            js("document.querySelectorAll('[role=radio]')[1].click()");
            waitFor("document.querySelector('.nokia-launcher').dataset.font==='classic'");
            assertEquals("Original font persists", "\"classic\"", js("localStorage.getItem('nokia-launcher.font.v1')"));
            assertEquals("Original font restored", "true", js("!getComputedStyle(document.querySelector('.font-sample')).fontFamily.includes('VT323')"));
            js("document.querySelectorAll('[role=radio]')[0].click()");
            waitFor("document.querySelector('.nokia-launcher').dataset.font==='vt323'");
            js("window.__pixelPaint=false;requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__pixelPaint=true)))");
            waitFor("window.__pixelPaint===true");
            System.out.println("PIXEL_FONT_SIZE " + js("(()=>{let c=document.createElement('canvas').getContext('2d');let height=(f)=>{c.font=f;let m=c.measureText('Settings');return m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};return {pixel:height('16px VT323'),classic:height('800 16px Inter')};})()"));
            File fontScreenshot = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "pixel-font-settings.png");
            try (FileOutputStream output = new FileOutputStream(fontScreenshot)) { InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,output); }
            js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Back').click()");
            waitFor("!!document.querySelector('[data-testid=screen-settings]')");
            js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Exit').click()");
            waitFor("!!document.querySelector('.lcd-home')");
            js("window.__pixelPaint=false;requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__pixelPaint=true)))");
            waitFor("window.__pixelPaint===true");
            File screenshot = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "pixel-font-home.png");
            try (FileOutputStream output = new FileOutputStream(screenshot)) { InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,output); }
        }
    }
}






