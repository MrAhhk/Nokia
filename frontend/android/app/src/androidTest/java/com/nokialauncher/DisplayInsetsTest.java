package com.nokialauncher;

import android.graphics.Rect;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DisplayInsetsTest {
    @Test public void systemInsetsDoNotResizeApprovedFrameOrConsumeIme() {
        assertEquals("com.nokialauncher.uismoke", androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                View content = activity.findViewById(android.R.id.content);
                WindowInsetsCompat original = ViewCompat.getRootWindowInsets(content);
                WindowInsetsCompat test = new WindowInsetsCompat.Builder()
                    .setDisplayCutout(new DisplayCutoutCompat(Insets.of(12,40,8,0), new Rect(0,0,12,40),null,null,null,Insets.NONE))
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.of(12,40,8,0))
                    .setInsets(WindowInsetsCompat.Type.captionBar(), Insets.of(0,28,0,0))
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0,0,0,240)).build();
                WindowInsetsCompat result = ViewCompat.dispatchApplyWindowInsets(content,test);
                ViewCompat.dispatchApplyWindowInsets(content,test);
                assertEquals(0,content.getPaddingLeft());
                assertEquals(0,content.getPaddingTop());
                assertEquals(0,content.getPaddingRight());
                assertEquals(0,content.getPaddingBottom());
                assertFalse(result.isConsumed());
                assertEquals(240,result.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                ViewCompat.dispatchApplyWindowInsets(content,new WindowInsetsCompat.Builder().build());
                assertEquals(0,content.getPaddingTop());
                if (original != null) ViewCompat.dispatchApplyWindowInsets(content,original);
                ViewCompat.requestApplyInsets(content);
            });
        }
    }
}
