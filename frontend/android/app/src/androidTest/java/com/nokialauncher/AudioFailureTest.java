package com.nokialauncher;

import android.content.Context;
import android.content.ContextWrapper;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class AudioFailureTest {
    private static class ResultCall extends PluginCall {
        String failure;
        Exception cause;
        ResultCall() { super(null, "LauncherApps", "test", "audio", new JSObject()); }
        @Override public void reject(String message, Exception exception) {
            failure = message;
            cause = exception;
        }
    }

    @Test public void unavailableAudioServiceRejectsBothCallsWithoutEscaping() {
        LauncherAppsPlugin plugin = new LauncherAppsPlugin() {
            @Override public Context getContext() {
                return new ContextWrapper(null) {
                    @Override public Object getSystemService(String name) {
                        throw new SecurityException("Device policy rejected audio access");
                    }
                };
            }
        };
        ResultCall alarm = new ResultCall();
        plugin.toggleSirenSound(alarm);
        assertEquals("audio_control_unavailable", alarm.failure);
        assertTrue(alarm.cause instanceof SecurityException);
        ResultCall notification = new ResultCall();
        plugin.cycleNotificationMode(notification);
        assertEquals("audio_control_unavailable", notification.failure);
        assertTrue(notification.cause instanceof SecurityException);
    }
}
