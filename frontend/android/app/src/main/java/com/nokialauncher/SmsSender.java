package com.nokialauncher;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Owns sent-result receivers until acknowledgement, timeout, or host teardown. */
final class SmsSender {
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Send> pending = new HashSet<>();
    private boolean closed;
    SmsSender(Context context) { this.context = context.getApplicationContext(); }

    void send(SmsManager manager, String address, String body, PluginCall call) {
        main.post(() -> {
            if (closed || pending.size() >= 4) { call.reject("sms_sender_unavailable"); return; }
            new Send(manager, address, body, call).start();
        });
    }

    void close() {
        main.post(() -> {
            closed = true;
            for (Send send : new ArrayList<>(pending)) send.finish("sms_send_unconfirmed");
        });
    }

    private final class Send extends BroadcastReceiver {
        final SmsManager manager;
        final String address, body;
        final PluginCall call;
        final ArrayList<PendingIntent> callbacks = new ArrayList<>();
        final Runnable timeout = () -> finish("sms_send_unconfirmed");
        SmsSendState state;
        boolean registered, finished;
        Send(SmsManager manager, String address, String body, PluginCall call) {
            this.manager = manager; this.address = address; this.body = body; this.call = call;
        }
        void start() {
            pending.add(this);
            try {
                ArrayList<String> parts = manager.divideMessage(body);
                if (parts == null || parts.isEmpty() || parts.size() > SmsSendState.MAX_PARTS) {
                    finish("sms_body_too_long");
                    return;
                }
                state = new SmsSendState(parts.size());
                String action = context.getPackageName() + ".SMS_SENT." + UUID.randomUUID();
                ContextCompat.registerReceiver(context, this, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
                registered = true;
                for (int i = 0; i < parts.size(); i++) {
                    Intent intent = new Intent(action).setPackage(context.getPackageName()).putExtra("part", i);
                    callbacks.add(PendingIntent.getBroadcast(context, i, intent,
                        PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE));
                }
                main.postDelayed(timeout, 60_000L);
                if (parts.size() == 1) manager.sendTextMessage(address, null, body, callbacks.get(0), null);
                else manager.sendMultipartTextMessage(address, null, parts, callbacks, null);
            } catch (Exception error) {
                finish("sms_send_failed");
            }
        }
        @Override public void onReceive(Context ignored, Intent intent) {
            if (finished) return;
            state.acknowledge(intent.getIntExtra("part", -1), getResultCode() == Activity.RESULT_OK);
            if (state.isComplete()) finish(state.isSent() ? null : "sms_send_failed_or_partial");
        }
        void finish(String error) {
            if (finished) return;
            finished = true;
            main.removeCallbacks(timeout);
            if (registered) { try { context.unregisterReceiver(this); } catch (IllegalArgumentException ignored) {} }
            for (PendingIntent callback : callbacks) callback.cancel();
            pending.remove(this);
            if (error != null) { call.reject(error); return; }
            JSObject result = new JSObject();
            result.put("sent", true);
            result.put("delivered", false); // No recipient delivery receipt was requested.
            result.put("targetNumber", address);
            call.resolve(result);
        }
    }
}
