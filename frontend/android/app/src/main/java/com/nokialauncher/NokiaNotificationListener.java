package com.nokialauncher;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Person;
import android.app.RemoteInput;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

public class NokiaNotificationListener extends NotificationListenerService {
    private static final String TAG = "NokiaNotif";
    private NotificationImageLoader imageLoader;
    private static volatile int activeNotificationCount = 0;
    public static volatile NokiaNotificationListener instance = null;

    public static class ReplyActionInfo {
        public final PendingIntent pendingIntent;
        public final RemoteInput remoteInput;
        public final String notificationKey;
        public final String packageName;

        public ReplyActionInfo(PendingIntent pendingIntent, RemoteInput remoteInput, String notificationKey, String packageName) {
            this.pendingIntent = pendingIntent;
            this.remoteInput = remoteInput;
            this.notificationKey = notificationKey;
            this.packageName = packageName;
        }
    }

    public static class NotificationConversation {
        public String id;
        public String threadId;
        public String address;
        public String contactName;
        public String appTag;
        public String appName;
        public String packageName;
        public String notificationKey;
        public String snippet;
        public long date;
        public int msgCount;
        public boolean unread;
        public boolean canReply;
        public String imageUrl;
    }

    public interface NotificationMessageListener {
        void onMessageReceived(NotificationConversation conv, String body);
        default void onImageUpdated(NotificationConversation conv) {}
        void onNotificationRemoved(String notificationKey);
        void onNotificationCountsChanged(Map<String, Integer> counts, int totalCount);
    }

    private static final Map<String, ReplyActionInfo> activeReplyActions = new ConcurrentHashMap<>();
    private static final int MAX_CONVERSATIONS = 100;
    private static final Map<String, NotificationConversation> conversationCache =
        Collections.synchronizedMap(new LinkedHashMap<String, NotificationConversation>(MAX_CONVERSATIONS, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Entry<String, NotificationConversation> eldest) {
                boolean evict = size() > MAX_CONVERSATIONS;
                if (evict) activeReplyActions.remove(eldest.getValue().notificationKey);
                return evict;
            }
        });

    private static volatile NotificationMessageListener messageListener = null;

    public static synchronized void setMessageListener(NotificationMessageListener listener) {
        messageListener = listener;
    }

    public static synchronized void clearMessageListener(NotificationMessageListener listener) {
        if (messageListener == listener) messageListener = null;
    }

    public static void ensureBound(Context context) {
        if (context == null) return;
        if (instance == null && hasAccess(context)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    Log.d(TAG, "ensureBound: requesting rebind for NokiaNotificationListener");
                    requestRebind(new ComponentName(context, NokiaNotificationListener.class));
                } catch (Exception e) {
                    Log.w(TAG, "ensureBound requestRebind failed: " + e.getMessage());
                }
            }
        }
    }

    @Override
    public void onListenerConnected() {
        Log.d(TAG, "onListenerConnected: listener service bound and active");
        instance = this;
        if (imageLoader == null) imageLoader = new NotificationImageLoader(this);
        refreshCount();
        refreshAllNotifications();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        refreshCount();
        processNotification(notification, true);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification notification) {
        refreshCount();
        if (notification != null) {
            String key = notification.getKey();
            if (key != null) {
                activeReplyActions.remove(key);
                synchronized (conversationCache) {
                    for (NotificationConversation conv : conversationCache.values()) {
                        if (key.equals(conv.notificationKey)) conv.canReply = false;
                    }
                }
                NotificationMessageListener listener = messageListener;
                if (listener != null) {
                    try {
                        listener.onNotificationRemoved(key);
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    private static final Map<String, Integer> packageNotificationCounts = new ConcurrentHashMap<>();
    private static volatile int lastReportedTotalCount = -1;
    private static final Map<String, Integer> lastReportedPackageCounts = new ConcurrentHashMap<>();

    public static Map<String, Integer> getPackageNotificationCounts() {
        return new HashMap<>(packageNotificationCounts);
    }

    private void cleanupState() {
        instance = null;
        activeNotificationCount = 0;
        lastReportedTotalCount = -1;
        lastReportedPackageCounts.clear();
        packageNotificationCounts.clear();
        activeReplyActions.clear();
        conversationCache.clear();
        if (imageLoader != null) {
            try { imageLoader.close(); } catch (Exception ignored) {}
            imageLoader = null;
        }
    }

    @Override
    public void onListenerDisconnected() {
        Log.d(TAG, "onListenerDisconnected: listener service unbound");
        cleanupState();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                if (hasAccess(this)) {
                    Log.d(TAG, "onListenerDisconnected: requesting rebind");
                    requestRebind(new ComponentName(this, NokiaNotificationListener.class));
                }
            } catch (Exception e) {
                Log.w(TAG, "onListenerDisconnected requestRebind failed: " + e.getMessage());
            }
        }
    }

    @Override
    public void onDestroy() {
        cleanupState();
        super.onDestroy();
    }

    private void refreshCount() {
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            activeNotificationCount = notifications == null ? 0 : notifications.length;
            Map<String, Integer> counts = new HashMap<>();
            if (notifications != null) {
                for (StatusBarNotification sbn : notifications) {
                    if (sbn != null && sbn.getPackageName() != null) {
                        String pkg = sbn.getPackageName();
                        Integer cur = counts.get(pkg);
                        counts.put(pkg, (cur == null ? 0 : cur) + 1);
                    }
                }
            }
            packageNotificationCounts.clear();
            packageNotificationCounts.putAll(counts);

            if (activeNotificationCount == lastReportedTotalCount && counts.equals(lastReportedPackageCounts)) {
                return;
            }
            lastReportedTotalCount = activeNotificationCount;
            lastReportedPackageCounts.clear();
            lastReportedPackageCounts.putAll(counts);

            NotificationMessageListener listener = messageListener;
            if (listener != null) {
                try {
                    listener.onNotificationCountsChanged(counts, activeNotificationCount);
                } catch (Exception ignored) {}
            }
        } catch (SecurityException ignored) {
            activeNotificationCount = 0;
            packageNotificationCounts.clear();
        }
    }

    private static volatile long lastRefreshTime = 0;

    public void refreshAllNotifications() {
        long now = System.currentTimeMillis();
        if (now - lastRefreshTime < 2000) {
            return;
        }
        lastRefreshTime = now;
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            if (notifications != null) {
                for (StatusBarNotification sbn : notifications) {
                    processNotification(sbn, false);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "refreshAllNotifications error: " + e.getMessage());
        }
    }

    private void processNotification(StatusBarNotification sbn, boolean isLiveEvent) {
        try {
            processNotificationUnsafe(sbn, isLiveEvent);
        } catch (RuntimeException malformedNotification) {
            Log.w(TAG, "Ignoring malformed notification extras");
        }
    }

    private void processNotificationUnsafe(StatusBarNotification sbn, boolean isLiveEvent) {
        if (sbn == null) return;
        Notification n = sbn.getNotification();
        if (n == null) return;

        String pkg = sbn.getPackageName();
        if (pkg == null) pkg = "";

        // Skip our own notifications or system SMS app (to prevent duplicating native SMS provider)
        if (pkg.equals(getPackageName()) ||
            pkg.equals("com.google.android.apps.messaging") ||
            pkg.equals("com.samsung.android.messaging") ||
            pkg.equals("com.android.mms")) {
            return;
        }

        // Ignore ongoing silent/service notifications (e.g., sync services)
        if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0 && (n.actions == null || n.actions.length == 0)) {
            return;
        }

        Bundle extras = n.extras;
        if (extras == null) return;

        // Try extracting title from multiple keys (standard, conversation, big title)
        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        if (titleCs == null || titleCs.length() == 0) {
            titleCs = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        }
        if (titleCs == null || titleCs.length() == 0) {
            titleCs = extras.getCharSequence(Notification.EXTRA_TITLE_BIG);
        }

        // Try extracting text from standard text / big text
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (textCs == null || textCs.length() == 0) {
            textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        }

        // Filter strictly to apps belonging to messages or email categories
        if (!isMessageOrEmail(n, pkg)) {
            return;
        }

        String imageUrl = null;

        // Handle modern MessagingStyle messages (e.g. WhatsApp, Telegram, Messenger)
        Object rawMessages = extras.get("android.messages");
        if (rawMessages instanceof Parcelable[]) {
            Parcelable[] pMessages = (Parcelable[]) rawMessages;
            if (pMessages.length > 0) {
                Parcelable last = pMessages[pMessages.length - 1];
                if (last instanceof Bundle) {
                    Bundle b = (Bundle) last;
                    CharSequence msgText = b.getCharSequence("text");
                    if (msgText != null && msgText.length() > 0) {
                        textCs = msgText;
                    }
                    if (titleCs == null || titleCs.length() == 0) {
                        CharSequence sender = b.getCharSequence("sender");
                        if (sender != null && sender.length() > 0) {
                            titleCs = sender;
                        } else {
                            Object personObj = b.get("sender_person");
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && personObj instanceof Person) {
                                titleCs = ((Person) personObj).getName();
                            }
                        }
                    }
                }
            }
        }

        // Handle InboxStyle text lines
        if (textCs == null || textCs.length() == 0) {
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null && lines.length > 0) {
                textCs = lines[lines.length - 1];
            }
        }

        // SubText or TickerText fallbacks
        if (textCs == null || textCs.length() == 0) {
            textCs = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        }
        if ((textCs == null || textCs.length() == 0) && n.tickerText != null) {
            textCs = n.tickerText;
        }

        // If no text but image is present, indicate picture
        if ((textCs == null || textCs.length() == 0) && NotificationImageLoader.hasImage(n)) {
            textCs = "[Hình ảnh]";
        }

        // Title fallback
        if (titleCs == null || titleCs.length() == 0) {
            titleCs = resolveAppName(this, pkg);
        }

        // If still no content, discard
        if (textCs == null || textCs.length() == 0) {
            return;
        }

        String title = titleCs.subSequence(0, Math.min(titleCs.length(), 256)).toString().trim();
        String text = textCs.subSequence(0, Math.min(textCs.length(), 8192)).toString().trim();

        // Check if message belongs to a recognized messenger or email
        String appTag = resolveAppTag(this, pkg);
        String appName = resolveAppName(this, pkg);

        // Find Direct Reply action
        ReplyActionInfo replyAction = findReplyAction(n, sbn.getKey(), pkg);

        String key = sbn.getKey();
        if (replyAction != null) {
            activeReplyActions.put(key, replyAction);
        }

        long date = sbn.getPostTime() > 0 ? sbn.getPostTime() : System.currentTimeMillis();
        String groupThreadId = "notif_" + pkg + "_" + title;

        NotificationConversation conv = new NotificationConversation();
        conv.id = key;
        conv.threadId = groupThreadId;
        conv.address = title;
        conv.contactName = title;
        conv.appTag = appTag;
        conv.appName = appName;
        conv.packageName = pkg;
        conv.notificationKey = key;
        conv.snippet = text;
        conv.date = date;
        conv.msgCount = 1;
        conv.unread = true;
        conv.canReply = (replyAction != null);
        conv.imageUrl = imageUrl;

        NotificationConversation existing = conversationCache.get(groupThreadId);
        boolean isContentIdentical = existing != null &&
            text.equals(existing.snippet) &&
            key.equals(existing.id) &&
            existing.canReply == (replyAction != null) && existing.date == date;

        if (isContentIdentical) {
            return;
        }

        synchronized (conversationCache) {
            if (existing != null && !key.equals(existing.notificationKey)) activeReplyActions.remove(existing.notificationKey);
            conversationCache.put(groupThreadId, conv);
        }
        if (imageLoader != null && NotificationImageLoader.hasImage(n)) {
            imageLoader.load(n, image -> {
                synchronized (conversationCache) {
                    if (instance != this || conversationCache.get(groupThreadId) != conv) return;
                    conv.imageUrl = image;
                    long bytes = 0;
                    for (NotificationConversation item : conversationCache.values()) {
                        if (item.imageUrl != null) bytes += item.imageUrl.length() * 2L;
                    }
                    for (NotificationConversation item : conversationCache.values()) {
                        if (bytes <= 2 * 1024 * 1024) break;
                        if (item.imageUrl != null) { bytes -= item.imageUrl.length() * 2L; item.imageUrl = null; }
                    }
                }
                NotificationMessageListener listener = messageListener;
                if (listener != null) listener.onImageUpdated(conv);
            });
        }

        if (isLiveEvent) {
            if (isContentIdentical) {
                return;
            }
            NotificationMessageListener listener = messageListener;
            if (listener != null) {
                try {
                    listener.onMessageReceived(conv, text);
                } catch (Exception ignored) {}
            }
        }
    }

    private ReplyActionInfo findReplyAction(Notification n, String key, String pkg) {
        if (n.actions != null) {
            for (Notification.Action action : n.actions) {
                if (action == null || action.actionIntent == null) continue;
                RemoteInput[] inputs = action.getRemoteInputs();
                if (inputs != null) {
                    for (RemoteInput input : inputs) {
                        if (input != null && (input.getAllowFreeFormInput() || input.getResultKey() != null)) {
                            return new ReplyActionInfo(action.actionIntent, input, key, pkg);
                        }
                    }
                }
            }
        }
        // Fallback for Wearable extensions
        Bundle extras = n.extras;
        if (extras != null) {
            Bundle wearableBundle = extras.getBundle("android.wearable.EXTENSIONS");
            if (wearableBundle != null) {
                ArrayList<Notification.Action> actions = wearableBundle.getParcelableArrayList("actions");
                if (actions != null) {
                    for (Notification.Action action : actions) {
                        if (action == null || action.actionIntent == null) continue;
                        RemoteInput[] inputs = action.getRemoteInputs();
                        if (inputs != null) {
                            for (RemoteInput input : inputs) {
                                if (input != null && (input.getAllowFreeFormInput() || input.getResultKey() != null)) {
                                    return new ReplyActionInfo(action.actionIntent, input, key, pkg);
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    public static boolean isMessageOrEmail(Notification n, String pkg) {
        if (pkg == null || pkg.isEmpty()) return false;
        String lower = pkg.toLowerCase(Locale.ROOT);

        // Check Notification category if explicitly set
        if (Notification.CATEGORY_MESSAGE.equals(n.category) ||
            Notification.CATEGORY_EMAIL.equals(n.category)) {
            return true;
        }

        // Known messaging apps packages/identifiers
        if (lower.contains("whatsapp") ||
            lower.contains("telegram") ||
            lower.contains("challegram") ||
            lower.contains("orca") ||
            lower.contains("mlite") ||
            lower.contains("messenger") ||
            lower.contains("zalo") ||
            lower.contains("securesms") ||
            lower.contains("signal") ||
            lower.contains("discord") ||
            lower.contains("slack") ||
            lower.contains("skype") ||
            lower.contains("viber") ||
            lower.contains("line") ||
            lower.contains("wechat") ||
            lower.contains("tencent.mm") ||
            lower.contains("teams") ||
            lower.contains("kakaotalk") ||
            lower.contains("imessage") ||
            lower.contains("element.io") ||
            lower.contains("wire")) {
            return true;
        }

        // Known email apps packages/identifiers
        if (lower.contains("android.gm") ||
            lower.contains("gmail") ||
            lower.contains("outlook") ||
            lower.contains("yahoo.mobile.client.android.mail") ||
            lower.contains("protonmail") ||
            lower.contains("fsck.k9") ||
            lower.contains("thunderbird") ||
            lower.contains("spark") ||
            lower.contains("yandex.mail") ||
            lower.contains("zoho.mail") ||
            lower.contains("bluemail") ||
            lower.contains("samsung.android.email") ||
            lower.contains("email") ||
            lower.contains("mail")) {
            return true;
        }

        return false;
    }

    public static String resolveAppTag(Context context, String pkg) {
        if (pkg == null || pkg.isEmpty()) return "[MSG]";
        String lower = pkg.toLowerCase(Locale.ROOT);
        if (lower.contains("whatsapp")) return "[WA]";
        if (lower.contains("telegram") || lower.contains("challegram")) return "[TG]";
        if (lower.contains("orca") || lower.contains("mlite") || lower.contains("messenger")) return "[FB]";
        if (lower.contains("zalo")) return "[ZL]";
        if (lower.contains("securesms")) return "[SG]";
        if (lower.contains("discord")) return "[DC]";
        if (lower.contains("slack")) return "[SL]";
        if (lower.contains("skype")) return "[SK]";
        if (lower.contains("viber")) return "[VB]";
        if (lower.contains("line")) return "[LN]";
        if (lower.contains("wechat") || lower.contains("tencent.mm")) return "[WC]";
        if (lower.contains("instagram")) return "[IG]";
        if (lower.contains("teams")) return "[TM]";
        if (lower.contains("kakaotalk")) return "[KT]";
        if (lower.contains("android.gm") || lower.contains("gmail")) return "[GML]";
        if (lower.contains("outlook")) return "[OUT]";
        if (lower.contains("yahoo")) return "[YAH]";
        if (lower.contains("proton")) return "[PRT]";
        if (lower.contains("mail") || lower.contains("email")) return "[EML]";

        // Dynamic fallback: read actual app name from Android PackageManager
        if (context != null) {
            try {
                PackageManager pm = context.getPackageManager();
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                CharSequence label = pm.getApplicationLabel(ai);
                if (label != null && label.length() > 0) {
                    String clean = label.toString().trim().replaceAll("[^a-zA-Z0-9]", "");
                    if (clean.length() >= 3) {
                        return "[" + clean.substring(0, 3).toUpperCase(Locale.ROOT) + "]";
                    } else if (clean.length() > 0) {
                        return "[" + clean.toUpperCase(Locale.ROOT) + "]";
                    }
                }
            } catch (Exception ignored) {}
        }
        return "[MSG]";
    }

    public static String resolveAppName(Context context, String pkg) {
        if (pkg == null || pkg.isEmpty()) return "Message";
        String lower = pkg.toLowerCase(Locale.ROOT);
        if (lower.contains("whatsapp")) return "WhatsApp";
        if (lower.contains("telegram") || lower.contains("challegram")) return "Telegram";
        if (lower.contains("orca") || lower.contains("mlite") || lower.contains("messenger")) return "Messenger";
        if (lower.contains("zalo")) return "Zalo";
        if (lower.contains("securesms")) return "Signal";
        if (lower.contains("discord")) return "Discord";
        if (lower.contains("slack")) return "Slack";
        if (lower.contains("skype")) return "Skype";
        if (lower.contains("viber")) return "Viber";
        if (lower.contains("line")) return "LINE";
        if (lower.contains("wechat") || lower.contains("tencent.mm")) return "WeChat";
        if (lower.contains("instagram")) return "Instagram";
        if (lower.contains("teams")) return "Teams";
        if (lower.contains("kakaotalk")) return "KakaoTalk";
        if (lower.contains("android.gm") || lower.contains("gmail")) return "Gmail";
        if (lower.contains("outlook")) return "Outlook";
        if (lower.contains("yahoo")) return "Yahoo Mail";
        if (lower.contains("proton")) return "ProtonMail";
        if (lower.contains("mail") || lower.contains("email")) return "Email";

        if (context != null) {
            try {
                PackageManager pm = context.getPackageManager();
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                CharSequence label = pm.getApplicationLabel(ai);
                if (label != null && label.length() > 0) {
                    return label.toString().trim();
                }
            } catch (Exception ignored) {}
        }
        return "Message";
    }

    public static boolean dismissNotification(String notificationKey) {
        if (notificationKey == null) return false;
        try {
            NokiaNotificationListener listener = instance;
            if (listener != null) {
                listener.cancelNotification(notificationKey);
                listener.refreshCount();
            }
            activeReplyActions.remove(notificationKey);
            synchronized (conversationCache) {
                List<String> keysToRemove = new ArrayList<>();
                for (Map.Entry<String, NotificationConversation> entry : conversationCache.entrySet()) {
                    NotificationConversation c = entry.getValue();
                    if (c != null && (notificationKey.equals(c.notificationKey) || notificationKey.equals(c.id))) {
                        keysToRemove.add(entry.getKey());
                    }
                }
                for (String k : keysToRemove) {
                    conversationCache.remove(k);
                }
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static boolean reply(Context context, String notificationKey, String replyText) {
        if (notificationKey == null || replyText == null) return false;
        ReplyActionInfo info = activeReplyActions.get(notificationKey);
        if (info == null || info.pendingIntent == null || info.remoteInput == null) {
            return false;
        }

        try {
            Bundle bundle = new Bundle();
            bundle.putCharSequence(info.remoteInput.getResultKey(), replyText);
            Intent fillInIntent = new Intent();
            RemoteInput.addResultsToIntent(new RemoteInput[]{ info.remoteInput }, fillInIntent, bundle);
            info.pendingIntent.send(context, 0, fillInIntent);
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public static List<NotificationConversation> getActiveConversations() {
        synchronized (conversationCache) { return new ArrayList<>(conversationCache.values()); }
    }

    public static int getActiveNotificationCount() {
        return activeNotificationCount;
    }

    public static boolean hasAccess(Context context) {
        if (context == null) return false;
        try {
            String enabled = Settings.Secure.getString(
                context.getContentResolver(),
                "enabled_notification_listeners"
            );
            if (enabled == null) return false;
            ComponentName component = new ComponentName(context, NokiaNotificationListener.class);
            String flat1 = component.flattenToString();
            String flat2 = component.flattenToShortString();
            return enabled.contains(flat1) || enabled.contains(flat2) || enabled.contains(context.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }
}
