package com.nokialauncher;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.MotionEvent;
import android.view.WindowInsets;
import android.view.DisplayCutout;
import android.graphics.Insets;
import android.graphics.Rect;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Framework-only runner: exercises the optimized app without test-only AndroidX/Kotlin ABI retention. */
public class OptimizedSmokeRunner extends Instrumentation {
    private WebView web;
    private boolean colorProbe;
    @Override public void onCreate(Bundle args) { super.onCreate(args); colorProbe = args != null && "true".equals(args.getString("colors")); start(); }
    private void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView)view;
        if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) {
            WebView found=findWeb(((ViewGroup)view).getChildAt(i)); if(found!=null)return found;
        }
        return null;
    }
    private String js(String code) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
        runOnMainSync(()->web.evaluateJavascript(code,value->{result.set(value);done.countDown();}));
        check(done.await(5,TimeUnit.SECONDS),"JS callback timeout"); return result.get();
    }
    private void waitFor(String code) throws Exception {
        long end=SystemClock.uptimeMillis()+15000;
        while(SystemClock.uptimeMillis()<end) { if("true".equals(js(code)))return;SystemClock.sleep(100); }
        throw new AssertionError("UI timeout: "+code);
    }
    @Override public void onStart() {
        Bundle result=new Bundle(); Activity activity=null;
        try {
            check("com.nokialauncher.uismoke".equals(getTargetContext().getPackageName()),"Isolated package required");
            activity=startActivitySync(new Intent().setClassName(getTargetContext(),"com.nokialauncher.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            Activity host=activity; runOnMainSync(()->web=findWeb(host.findViewById(android.R.id.content)));
            check(web!=null,"Packaged WebView missing");
            waitFor("!!document.querySelector('.onboarding-coach,.lcd-home')");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Skip guide'))?.click()");
            waitFor("(()=>{let s=document.querySelector('[data-tone-choice=skip]');if(s)s.click();return !!document.querySelector('.lcd-home')})()");
            // Capacitor discovers this native method through runtime annotations/reflection.
            js("window.__nativeSmoke=false;window.Capacitor.Plugins.LauncherApps.getDeviceStatus().then(()=>window.__nativeSmoke=true)");
            waitFor("window.__nativeSmoke===true");
            if(android.os.Build.VERSION.SDK_INT>=30) runOnMainSync(()->{
                View content=host.findViewById(android.R.id.content);
                WindowInsets original=content.getRootWindowInsets();
                WindowInsets probe=new WindowInsets.Builder()
                    .setDisplayCutout(new DisplayCutout(new Rect(12,40,8,0),Collections.singletonList(new Rect(0,0,12,40))))
                    .setInsets(WindowInsets.Type.captionBar(),Insets.of(0,28,0,0))
                    .setInsets(WindowInsets.Type.ime(),Insets.of(0,0,0,240)).build();
                WindowInsets passed=content.dispatchApplyWindowInsets(probe);
                content.dispatchApplyWindowInsets(probe);
                check(content.getPaddingLeft()==0&&content.getPaddingTop()==0&&content.getPaddingRight()==0&&content.getPaddingBottom()==0,"Hardware must remain full-window");
                check(!passed.isConsumed()&&passed.getInsets(WindowInsets.Type.ime()).bottom==240,"Insets must reach children");
                content.dispatchApplyWindowInsets(new WindowInsets.Builder().build());
                check(content.getPaddingTop()==0,"Insets must reset");
                if(original!=null)content.dispatchApplyWindowInsets(original);content.requestApplyInsets();
            });
            for(int cycle=0;cycle<3;cycle++) {
                js("Array.from(document.querySelectorAll('.lcd-home .lcd-softkeys button')).find(b=>b.textContent==='Settings').click()");
                waitFor("!!document.querySelector('[data-testid=screen-settings]')");
                if(cycle==0) {
                    int count=Integer.parseInt(js("document.querySelectorAll('.lcd-list-row').length"));
                    js("window.__frames=[];document.querySelector('[aria-label=Down]').addEventListener('pointerdown',()=>{let t=performance.now();requestAnimationFrame(()=>window.__frames.push(performance.now()-t))});Array.from(document.querySelectorAll('.lcd-list-row')).forEach((b,i)=>b.dataset.probeIndex=i)");
                    JSONObject p=new JSONObject(js("(()=>{let r=document.querySelector('[aria-label=Down]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth}})()"));
                    float scale=web.getWidth()/(float)p.getDouble("w");int[] pos=new int[2];runOnMainSync(()->web.getLocationOnScreen(pos));
                    float x=pos[0]+(float)p.getDouble("x")*scale,y=pos[1]+(float)p.getDouble("y")*scale;
                    for(int i=0;i<20;i++) {
                        long t=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(t,t,MotionEvent.ACTION_DOWN,x,y,0);sendPointerSync(down);SystemClock.sleep(30);
                        MotionEvent up=MotionEvent.obtain(t,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);sendPointerSync(up);down.recycle();up.recycle();
                        waitFor("document.querySelector('.lcd-list-row.is-selected')?.dataset.probeIndex==='"+((i+1)%count)+"'");
                    }
                    waitFor("window.__frames.length===20");
                    result.putString("frames",js("(()=>{let a=window.__frames.sort((a,b)=>a-b);return {samples:a.length,p50:a[9],p90:a[17]}})()"));
                }
                js("Array.from(document.querySelectorAll('.lcd-list-softkeys button')).find(b=>b.textContent==='Exit').click()");
                waitFor("!!document.querySelector('.lcd-home')");
            }
            js("window.__paint=false;requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__paint=true)))");waitFor("window.__paint===true");
            check("true".equals(js("(()=>{let f=document.querySelector('.nokia-launcher').getBoundingClientRect(),s=document.querySelector('.lcd-home').getBoundingClientRect();return Math.abs(f.top)<1&&Math.abs(f.height-innerHeight)<1&&Math.abs(parseFloat(getComputedStyle(document.querySelector('.nokia-launcher__screen')).paddingTop)-f.height*.032)<1&&s.top<innerHeight*.08;})()")),"Handset fills viewport and approved 3.2 percent bezel is restored");
            try(FileOutputStream output=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"optimized-home.png"))) {
                getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);
            }
            if (colorProbe) {
                String previous = new org.json.JSONArray("[" + js("document.querySelector('.nokia-launcher').dataset.keyboardColor") + "]").getString(0);
                js("Array.from(document.querySelectorAll('.lcd-home .lcd-softkeys button')).find(b=>b.textContent==='Settings').click()");
                waitFor("!!document.querySelector('[data-testid=screen-settings]')");
                js("Array.from(document.querySelectorAll('.lcd-list-row')).find(b=>b.textContent.includes('Customization')).click()");
                waitFor("!!document.querySelector('[data-testid=open-keyboard-color]')");
                js("document.querySelector('[data-testid=open-keyboard-color]').click()");
                waitFor("document.querySelectorAll('.keyboard-color-option').length===9");
                try {
                    for (String color : new String[]{"red","orange","yellow","green","blue","indigo","violet","white","black"}) {
                        js("document.querySelector('.keyboard-color-option[data-color=" + color + "]').click()");
                        waitFor("document.querySelector('.nokia-launcher').dataset.keyboardColor==='" + color + "' && document.querySelector('.keyboard-color-message').textContent==='Saved.'");
                        check(color.equals(getTargetContext().getSharedPreferences("nokia_keyboard_appearance",0).getString("color","")), "IME shared preference: " + color);
                        if ("white".equals(color)) {
                            js("window.__colorPaint=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__colorPaint=true))"); waitFor("window.__colorPaint===true");
                            try(FileOutputStream output=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"keyboard-colors.png"))) {
                                getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);
                            }
                        }
                    }
                    result.putString("colors", "PASS: all nine UI choices and native IME preferences");
                } finally {
                    js("document.querySelector('.keyboard-color-option[data-color=" + previous + "]').click()");
                    waitFor("document.querySelector('.nokia-launcher').dataset.keyboardColor==='" + previous + "'");
                }
            }
            result.putString("result","PASS: native bridge, cutout/caption/reset/IME, 20 ordered inputs, 3 Home returns");
            finish(Activity.RESULT_OK,result);
        } catch(Throwable error) { result.putString("error",error.toString());finish(Activity.RESULT_CANCELED,result); }
    }
}
