package com.nokialauncher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

public class SmsBroadcastReceiver extends BroadcastReceiver {
    public interface OnSmsReceivedListener {
        void onSmsReceived(String address, String body, long date);
    }

    private static volatile OnSmsReceivedListener activeListener = null;

    public static void setListener(OnSmsReceivedListener listener) {
        activeListener = listener;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(action)) {
            try {
                SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
                if (messages != null && messages.length > 0) {
                    String sender = messages[0].getDisplayOriginatingAddress();
                    StringBuilder body = new StringBuilder();
                    long timestamp = messages[0].getTimestampMillis();
                    for (SmsMessage msg : messages) {
                        if (msg != null && msg.getDisplayMessageBody() != null) {
                            body.append(msg.getDisplayMessageBody());
                        }
                    }
                    if (activeListener != null) {
                        activeListener.onSmsReceived(
                            sender != null ? sender : "",
                            body.toString(),
                            timestamp > 0 ? timestamp : System.currentTimeMillis()
                        );
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
