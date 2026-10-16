package com.nokialauncher;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.TextureView;
import android.webkit.WebView;
import android.widget.ImageView;
import androidx.camera.view.PreviewView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Isolated offline fixtures: never captures a photo, records audio or uninstalls an app. */
@RunWith(AndroidJUnit4.class)
public class CameraGalleryUiTest {
    private WebView web;
    private MainActivity host;
    private String js(String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(source, value -> { result.set(value); latch.countDown(); }));
        assertTrue(latch.await(5, TimeUnit.SECONDS));
        return result.get();
    }
    private void ready(String condition) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 12000;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(js(condition))) return;
            SystemClock.sleep(80);
        }
        fail("Not ready: " + condition + " UI=" + js("document.body.innerText.slice(0,500)"));
    }
    private void button(String label) throws Exception {
        js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(label) + ")?.click()");
    }
    private <T extends View> T find(View view, Class<T> type) {
        if (type.isInstance(view)) return type.cast(view);
        if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) {
            T child = find(((ViewGroup)view).getChildAt(i), type); if (child != null) return child;
        }
        return null;
    }
    private void screenshot(Context context, String name) throws Exception {
        // DOM readiness precedes WebView compositor presentation. Do not save the prior screen.
        js("window.__uiShotReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__uiShotReady=true}))");
        ready("window.__uiShotReady===true");
        SystemClock.sleep(200);
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        try (FileOutputStream out = new FileOutputStream(new File(context.getExternalFilesDir(null), name))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } finally { bitmap.recycle(); }
    }

    @Test public void nativePreviewGalleryMissingMediaAndDrawerOptions() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.nokialauncher.uismoke", context.getPackageName());
        SharedPreferences prefs = context.getSharedPreferences("nokia_camera_catalog", Context.MODE_PRIVATE);
        String original = prefs.getString("media", "[]");
        // A killed runner cannot execute finally; discard only prior named synthetic fixtures.
        JSONArray prior = new JSONArray(original), retained = new JSONArray();
        for (int index=0;index<prior.length();index++) {
            JSONObject item = prior.optJSONObject(index);
            if (item != null && !java.util.Arrays.asList("missing-video","missing-photo","fixture-video","fixture-photo").contains(item.optString("id"))) retained.put(item);
        }
        original = retained.toString();
        File image = new File(context.getCacheDir(), "ui-gallery-fixture.jpg");
        File video = new File(context.getCacheDir(), "ui-gallery-fixture.mp4");
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("ui/gallery-fixture.mp4"); FileOutputStream out = new FileOutputStream(video)) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
        }
        Bitmap bitmap = Bitmap.createBitmap(320, 240, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap); canvas.drawColor(0xffb8c8b7);
        Paint paint = new Paint(); paint.setColor(0xffffe7a6); canvas.drawCircle(240, 55, 25, paint);
        paint.setColor(0xff526a57); canvas.drawRect(0, 145, 320, 240, paint);
        try (FileOutputStream out = new FileOutputStream(image)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out); }
        bitmap.recycle();
        JSONArray fixtures = new JSONArray();
        fixtures.put(new JSONObject().put("id", "missing-video").put("type", "video").put("uri", Uri.fromFile(new File(context.getCacheDir(), "missing-ui-video.mp4"))));
        fixtures.put(new JSONObject().put("id", "missing-photo").put("type", "photo").put("uri", Uri.fromFile(new File(context.getCacheDir(), "missing-ui-photo.jpg"))));
        fixtures.put(new JSONObject().put("id", "fixture-video").put("type", "video").put("uri", Uri.fromFile(video)));
        fixtures.put(new JSONObject().put("id", "fixture-photo").put("type", "photo").put("uri", Uri.fromFile(image)));
        assertTrue(prefs.edit().putString("media", fixtures.toString()).commit());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> { host = activity; web = activity.getBridge().getWebView(); });
            ready("!!document.querySelector('.onboarding-coach,.lcd-home')");
            button("Skip guide"); button("Not now");
            ready("(()=>{let e=document.querySelector('[data-tone-choice=skip]');if(e){e.click();return false;}return !!document.querySelector('.lcd-home')})()");
            js("window.__homeLcdStyle=(()=>{let s=getComputedStyle(document.querySelector('.lcd-home'));return ['backgroundColor','backgroundImage','boxShadow','borderRadius'].map(k=>s[k]).join('|')})()");
            js("document.querySelector('[data-testid=home-menu-item-camera]').click()");
            ready("!!document.querySelector('[data-testid=screen-camera]')");
            // Existing owner-granted Camera permission only; this probe never presses the shutter.
            long deadline = SystemClock.uptimeMillis() + 12000;
            AtomicReference<PreviewView> preview = new AtomicReference<>();
            while ((preview.get() == null || preview.get().getWidth() == 0) && SystemClock.uptimeMillis() < deadline) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> preview.set(find(host.getWindow().getDecorView(), PreviewView.class)));
                SystemClock.sleep(80);
            }
            assertNotNull("Camera preview requires the existing granted permission", preview.get());
            JSONObject bounds = new JSONObject(js("(()=>{let r=document.querySelector('.camera-native-slot--full').getBoundingClientRect(),s=devicePixelRatio;return {w:r.width*s,h:r.height*s}})()"));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                assertEquals(PreviewView.ScaleType.FILL_CENTER, preview.get().getScaleType());
                assertEquals((int)Math.round(bounds.optDouble("w")), preview.get().getWidth());
                assertEquals((int)Math.round(bounds.optDouble("h")), preview.get().getHeight());
            });
            screenshot(context, "ui-camera-full-preview.png");
            js("document.querySelector('[data-testid=keypad-btn-tab]').click()");
            ready("document.querySelectorAll('.camera-gallery__item').length===4");
            assertEquals("true", js("(()=>{let s=getComputedStyle(document.querySelector('.camera-screen--gallery'));return ['backgroundColor','backgroundImage','boxShadow','borderRadius'].map(k=>s[k]).join('|')===window.__homeLcdStyle})()"));
            assertEquals("true", js("getComputedStyle(document.querySelector('.camera-gallery')).gridTemplateColumns.split(' ').length===2"));
            assertEquals("true", js("document.querySelector('.camera-gallery').clientHeight>100"));
            assertEquals("true", js("(()=>{let a=document.querySelector('.camera-gallery').getBoundingClientRect(),b=document.querySelector('.camera-softkeys').getBoundingClientRect();return a.bottom<=b.top+1})()"));
            screenshot(context, "ui-gallery.png");
            button("Open");
            ready("!!document.querySelector('[data-testid=screen-camera-viewer]')");
            ready("document.querySelector('.camera-viewer-fallback')?.complete===true");
            SystemClock.sleep(300);
            AtomicReference<ImageView> shown = new AtomicReference<>();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> shown.set(find(host.getWindow().getDecorView(), ImageView.class)));
            assertNotNull(shown.get());
            assertNotNull("Real sampled media decoded", shown.get().getDrawable());
            screenshot(context, "ui-photo-viewer.png");
            button("Next");
            ready("document.querySelector('.camera-header strong')?.textContent==='Video' && !document.querySelector('.camera-viewer-error')");
            AtomicReference<TextureView> videoTexture = new AtomicReference<>();
            long videoDeadline = SystemClock.uptimeMillis() + 6000;
            while (videoTexture.get() == null && SystemClock.uptimeMillis() < videoDeadline) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> videoTexture.set(find(host.getWindow().getDecorView(), TextureView.class)));
                SystemClock.sleep(80);
            }
            assertNotNull("Local video reached native TextureView", videoTexture.get());
            assertTrue(videoTexture.get().isAvailable());
            button("Play / pause");
            AtomicReference<Boolean> playing = new AtomicReference<>(false);
            long playDeadline = SystemClock.uptimeMillis() + 2000;
            while (!playing.get() && SystemClock.uptimeMillis() < playDeadline) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    try {
                        View parent = (View) videoTexture.get().getParent();
                        java.lang.reflect.Method check = parent.getClass().getDeclaredMethod("isPlaying");
                        check.setAccessible(true); playing.set((Boolean)check.invoke(parent));
                    } catch (Exception error) { throw new AssertionError(error); }
                });
                SystemClock.sleep(80);
            }
            assertTrue("Touch Play starts actual local video", playing.get());
            button("Play / pause");
            screenshot(context, "ui-video-viewer.png");
            button("Next");
            ready("!!document.querySelector('.camera-viewer-error')");
            assertEquals("true", js("document.querySelector('.camera-viewer-error').textContent.includes('Cannot open photo')"));
            button("Next");
            ready("document.querySelector('.camera-viewer-error')?.textContent.includes('Cannot open video')===true");
            button("Back"); ready("!!document.querySelector('[data-testid=screen-camera-gallery]')");
            button("Exit"); ready("!!document.querySelector('.lcd-home')");
            button("Menu"); ready("!!document.querySelector('[data-testid=screen-menu]')");
            js("document.querySelector('[data-testid=screen-menu] .lcd-list-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
            ready("!!document.querySelector('[data-testid=drawer-options]')");
            assertEquals("true", js("(()=>{let s=getComputedStyle(document.querySelector('.drawer-app-options'));return ['backgroundColor','backgroundImage','boxShadow','borderRadius'].map(k=>s[k]).join('|')===window.__homeLcdStyle})()"));
            assertEquals("true", js("Array.from(document.querySelectorAll('.drawer-options-list button')).every(e=>getComputedStyle(e).borderTopWidth==='0px')"));
            screenshot(context, "ui-drawer-options.png");
            button("Back"); ready("!document.querySelector('[data-testid=drawer-options]')");
            button("Exit"); ready("!!document.querySelector('.lcd-home')");
        } finally {
            assertTrue(prefs.edit().putString("media", original).commit());
            // Delete only the synthetic file created by this isolated probe.
            assertTrue(!image.exists() || image.delete());
            assertTrue(!video.exists() || video.delete());
        }
    }
}
