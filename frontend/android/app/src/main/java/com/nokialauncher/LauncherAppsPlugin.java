package com.nokialauncher;

import android.app.role.RoleManager;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.ContentObserver;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.provider.CallLog;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.telephony.SmsManager;
import android.telephony.SubscriptionManager;
import android.view.inputmethod.InputMethodManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.nokialauncher.camera.BuiltInCameraController;
import com.nokialauncher.browser.BuiltInBrowserController;
import java.util.ArrayList;
import java.text.Collator;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import org.json.JSONArray;

@CapacitorPlugin(
    name = "LauncherApps",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "callLog", strings = { Manifest.permission.READ_CALL_LOG, Manifest.permission.WRITE_CALL_LOG }),
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS, Manifest.permission.RECEIVE_SMS })
    }
)
@SuppressWarnings({"unused", "SpellCheckingInspection", "deprecation"})
public class LauncherAppsPlugin extends Plugin {
    private BuiltInCameraController cameraController;
    private BuiltInBrowserController browserController;
    private boolean flashlightOn = false;
    private ToneGenerator toneGenerator;
    private SmsSender smsSender;
    private final Set<PluginCall> providerCalls = Collections.newSetFromMap(new ConcurrentHashMap<PluginCall, Boolean>());
    private final ThreadPoolExecutor providerExecutor = new ThreadPoolExecutor(
        2, 2, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(16),
        new ThreadPoolExecutor.AbortPolicy()
    );
    private NokiaNotificationListener.NotificationMessageListener notificationMessageListener;

    private com.nokialauncher.dumbmode.DumbModeController dumbMode;
    private com.nokialauncher.dumbmode.PairingQrController pairingQr;
    private long pairingScanGeneration;
    private String pendingPairingScanId;
    private final com.nokialauncher.dumbmode.DumbModeController.Listener dumbModeListener =
        new com.nokialauncher.dumbmode.DumbModeController.Listener() {
            @Override public void changed(JSObject snapshot) { if (!destroyed) notifyListeners("dumbModeChanged", snapshot); }
            @Override public void friendsChanged(JSObject snapshot) { if (!destroyed) notifyListeners("friendAuthenticatorChanged", snapshot); }
        };

    private volatile boolean destroyed;
    private android.content.pm.LauncherApps packageService;
    private android.content.pm.LauncherApps.Callback packageCallback;
    private final Handler packageHandler = new Handler(Looper.getMainLooper());
    private final Runnable notifyPackagesChanged = () -> {
        if (!destroyed) {
            notifyListeners("installedAppsChanged", new JSObject(), true);
            if (dumbMode != null) dumbMode.packagesChanged();
        }
    };

    private void registerPackageUpdates() {
        if (destroyed || packageCallback != null) return;
        packageService = (android.content.pm.LauncherApps) getContext().getSystemService(Context.LAUNCHER_APPS_SERVICE);
        if (packageService == null) return;
        android.content.pm.LauncherApps.Callback callback = new android.content.pm.LauncherApps.Callback() {
            private void changed(android.os.UserHandle user) {
                if (destroyed || !android.os.Process.myUserHandle().equals(user)) return;
                // Batch a burst from the same installation without polling.
                packageHandler.removeCallbacks(notifyPackagesChanged);
                packageHandler.postDelayed(notifyPackagesChanged, 100);
            }
            @Override public void onPackageAdded(String name, android.os.UserHandle user) { changed(user); }
            @Override public void onPackageRemoved(String name, android.os.UserHandle user) { changed(user); }
            @Override public void onPackageChanged(String name, android.os.UserHandle user) { changed(user); }
            @Override public void onPackagesAvailable(String[] names, android.os.UserHandle user, boolean replacing) { changed(user); }
            @Override public void onPackagesUnavailable(String[] names, android.os.UserHandle user, boolean replacing) { changed(user); }
            @Override public void onPackagesSuspended(String[] names, android.os.UserHandle user) { changed(user); }
            @Override public void onPackagesUnsuspended(String[] names, android.os.UserHandle user) { changed(user); }
        };
        try {
            packageService.registerCallback(callback, packageHandler);
            packageCallback = callback;
        } catch (RuntimeException unavailable) {
            packageService = null;
        }
    }
    private ContentObserver callLogObserver;
    private ContentResolver callLogResolver;
    private final Handler callLogHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingCallLogNotify;

    private synchronized void registerCallLogObserver() {
        if (destroyed || callLogObserver != null) return;
        Context context = getContext();
        if (context == null || context.checkSelfPermission(Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED) return;
        ContentResolver resolver = context.getContentResolver();
        ContentObserver observer = new ContentObserver(callLogHandler) {
            @Override public void onChange(boolean selfChange, Uri uri) {
                synchronized (LauncherAppsPlugin.this) {
                    if (destroyed || callLogObserver != this || pendingCallLogNotify != null) return;
                    // Coalesce a burst without indefinitely postponing an update.
                    pendingCallLogNotify = () -> {
                        synchronized (LauncherAppsPlugin.this) {
                            pendingCallLogNotify = null;
                            if (destroyed || callLogObserver != this) return;
                            JSObject event = new JSObject();
                            event.put("timestamp", System.currentTimeMillis());
                            notifyListeners("recentCallsChanged", event);
                        }
                    };
                    callLogHandler.postDelayed(pendingCallLogNotify, 300);
                }
            }
        };
        try {
            resolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer);
            callLogResolver = resolver;
            callLogObserver = observer;
        } catch (RuntimeException deniedOrUnavailable) {
            android.util.Log.w("LauncherAppsPlugin", "Call log observer unavailable");
        }
    }

    private synchronized void unregisterCallLogObserver() {
        if (pendingCallLogNotify != null) callLogHandler.removeCallbacks(pendingCallLogNotify);
        pendingCallLogNotify = null;
        if (callLogObserver != null && callLogResolver != null) {
            try { callLogResolver.unregisterContentObserver(callLogObserver); }
            catch (RuntimeException ignored) {}
        }
        callLogObserver = null;
        callLogResolver = null;
    }

    private synchronized ToneGenerator getToneGenerator() {
        if (toneGenerator == null) {
            try {
                toneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);
            } catch (Exception e) {
                toneGenerator = null;
            }
        }
        return toneGenerator;
    }

    private synchronized void releaseToneGenerator() {
        if (toneGenerator != null) {
            try {
                toneGenerator.release();
            } catch (Exception ignored) {}
            toneGenerator = null;
        }
    }

    private android.database.ContentObserver smsObserver = null;
    private android.content.BroadcastReceiver dynamicSmsReceiver = null;
    private long lastSmsNotifyTime = 0;

    @Override
    public void load() {
        super.load();
        dumbMode = com.nokialauncher.dumbmode.DumbModeController.get(getContext());
        dumbMode.attach(dumbModeListener, this);
        registerPackageUpdates();
        smsSender = new SmsSender(getContext());
        initSmsListeners();
        initNotificationMessageListener();
    }

    private synchronized void initNotificationMessageListener() {
        Context context = getContext();
        if (context != null) {
            NokiaNotificationListener.ensureBound(context);
        }
        notificationMessageListener = new NokiaNotificationListener.NotificationMessageListener() {
            @Override
            public void onMessageReceived(NokiaNotificationListener.NotificationConversation conv, String body) {
                JSObject event = new JSObject();
                event.put("id", conv.id);
                event.put("threadId", conv.threadId);
                event.put("address", conv.address);
                event.put("contactName", conv.contactName);
                event.put("appTag", conv.appTag);
                event.put("appName", conv.appName);
                event.put("packageName", conv.packageName);
                event.put("notificationKey", conv.notificationKey);
                event.put("body", body);
                event.put("snippet", conv.snippet);
                event.put("date", conv.date);
                event.put("canReply", conv.canReply);
                event.put("imageUrl", conv.imageUrl);
                event.put("source", "notification");
                notifyListeners("notificationMessageReceived", event);
            }

            @Override
            public void onImageUpdated(NokiaNotificationListener.NotificationConversation conv) {
                JSObject event = new JSObject();
                event.put("id", conv.id);
                event.put("threadId", conv.threadId);
                event.put("imageUrl", conv.imageUrl);
                event.put("imageOnly", true);
                notifyListeners("notificationMessageReceived", event);
            }

            @Override
            public void onNotificationRemoved(String notificationKey) {
                JSObject event = new JSObject();
                event.put("notificationKey", notificationKey);
                notifyListeners("notificationMessageRemoved", event);
            }

            @Override
            public void onNotificationCountsChanged(Map<String, Integer> counts, int totalCount) {
                JSObject event = new JSObject();
                event.put("totalCount", totalCount);
                JSObject pkgCounts = new JSObject();
                if (counts != null) {
                    for (Map.Entry<String, Integer> entry : counts.entrySet()) {
                        pkgCounts.put(entry.getKey(), entry.getValue());
                    }
                }
                event.put("packageNotificationCounts", pkgCounts);
                notifyListeners("notificationCountsChanged", event);
            }
        };
        NokiaNotificationListener.setMessageListener(notificationMessageListener);
    }

    private static final java.util.Map<String, Long> recentSmsCache = new java.util.concurrent.ConcurrentHashMap<>();

    private synchronized void dispatchIncomingSms(String address, String body, long date) {
        if (destroyed) return;
        if (address == null) address = "";
        if (body == null) body = "";
        if (address.isEmpty() && body.isEmpty()) return;

        String dedupKey = address + "::" + body;
        long now = System.currentTimeMillis();
        Long lastSeen = recentSmsCache.get(dedupKey);
        if (lastSeen != null && (now - lastSeen < 3000)) {
            // Suppress duplicate SMS event within 3 seconds
            return;
        }
        recentSmsCache.put(dedupKey, now);
        if (recentSmsCache.size() > 50) {
            Iterator<Map.Entry<String, Long>> it = recentSmsCache.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, Long> entry = it.next();
                if (entry.getValue() != null && (now - entry.getValue() > 10000)) {
                    it.remove();
                }
            }
        }

        if (recentSmsCache.size() > 100) recentSmsCache.clear();
        JSObject event = new JSObject();
        event.put("address", address);
        event.put("body", body);
        event.put("date", date > 0 ? date : now);
        event.put("immediate", true);
        event.put("type", "sms_received");
        notifyListeners("smsReceived", event);
    }

    private void handleIncomingSmsIntent(Intent intent) {
        try {
            android.telephony.SmsMessage[] messages = android.provider.Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (messages != null && messages.length > 0) {
                String sender = messages[0].getDisplayOriginatingAddress();
                StringBuilder body = new StringBuilder();
                long timestamp = messages[0].getTimestampMillis();
                for (android.telephony.SmsMessage msg : messages) {
                    if (msg != null && msg.getDisplayMessageBody() != null) {
                        body.append(msg.getDisplayMessageBody());
                    }
                }
                dispatchIncomingSms(sender != null ? sender : "", body.toString(), timestamp);
            }
        } catch (Exception e) {
            android.util.Log.w("LauncherAppsPlugin", "Error parsing incoming SMS intent: " + e.getMessage());
        }
    }

    private synchronized void initSmsListeners() {
        if (destroyed) return;
        registerSmsReceiver();
        SmsBroadcastReceiver.setListener((address, body, date) -> {
            dispatchIncomingSms(address, body, date);
        });
    }

    private synchronized void registerSmsReceiver() {
        if (destroyed || dynamicSmsReceiver != null) return;
        try {
            Context context = getContext();
            if (context == null) return;
            dynamicSmsReceiver = new android.content.BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    if (intent == null) return;
                    if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
                        handleIncomingSmsIntent(intent);
                    }
                }
            };
            IntentFilter filter = new IntentFilter("android.provider.Telephony.SMS_RECEIVED");
            filter.setPriority(IntentFilter.SYSTEM_HIGH_PRIORITY);
            androidx.core.content.ContextCompat.registerReceiver(context, dynamicSmsReceiver, filter,
                Manifest.permission.BROADCAST_SMS, null, androidx.core.content.ContextCompat.RECEIVER_EXPORTED);
        } catch (Exception e) {
            dynamicSmsReceiver = null;
            android.util.Log.w("LauncherAppsPlugin", "Dynamic SMS receiver unavailable");
        }
    }

    private synchronized void unregisterSmsReceiver() {
        if (dynamicSmsReceiver != null) {
            try {
                Context context = getContext();
                if (context != null) {
                    context.unregisterReceiver(dynamicSmsReceiver);
                }
            } catch (Exception ignored) {}
            dynamicSmsReceiver = null;
        }
    }

    private synchronized void registerSmsObserver() {
        // No-op: ContentObserver on content://sms creates recursive feedback loops with markConversationRead.
        // Incoming SMS is handled strictly and cleanly by Telephony.Sms.Intents.SMS_RECEIVED_ACTION.
    }

    private synchronized void unregisterSmsObserver() {
        // No-op
    }

    @Override
    protected void handleOnPause() {
        pairingScanGeneration++;
        pendingPairingScanId = null;
        if (pairingQr != null) pairingQr.pauseForBackground();
        if (cameraController != null) cameraController.pauseForBackground();
        if (browserController != null) browserController.pauseForBackground();
    }

    @Override
    protected void handleOnResume() {
        if (destroyed) return;
        if (dumbMode != null) dumbMode.availabilityChanged();
        registerCallLogObserver();
        if (browserController != null) browserController.resumeFromBackground();
        initSmsListeners();
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        pairingScanGeneration++;
        pendingPairingScanId = null;
        if (pairingQr != null) { pairingQr.destroy(); pairingQr = null; }
        if (dumbMode != null) dumbMode.detach(dumbModeListener, this);
        packageHandler.removeCallbacksAndMessages(null);
        if (packageService != null && packageCallback != null) {
            try { packageService.unregisterCallback(packageCallback); } catch (RuntimeException ignored) {}
        }
        packageCallback = null;
        packageService = null;
        unregisterCallLogObserver();
        if (smsSender != null) smsSender.close();
        NokiaNotificationListener.clearMessageListener(notificationMessageListener);
        notificationMessageListener = null;
        SmsBroadcastReceiver.setListener(null);
        unregisterSmsReceiver();
        unregisterSmsObserver();
        releaseToneGenerator();
        providerExecutor.shutdownNow();
        for (PluginCall call : providerCalls) call.reject("plugin_destroyed");
        providerCalls.clear();
        if (cameraController != null) {
            cameraController.destroy();
            cameraController = null;
        }
        if (browserController != null) {
            browserController.destroy();
            browserController = null;
        }
    }

    private void executeProviderTask(PluginCall call, Runnable task) {
        if (destroyed || providerExecutor.isShutdown()) {
            call.reject("plugin_destroyed");
            return;
        }
        providerCalls.add(call);
        try {
            providerExecutor.execute(() -> {
                try {
                    if (Thread.currentThread().isInterrupted()) {
                        call.reject("provider_query_cancelled");
                        return;
                    }
                    task.run();
                } catch (RuntimeException failure) {
                    call.reject("provider_operation_failed");
                } finally {
                    providerCalls.remove(call);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException rejected) {
            providerCalls.remove(call);
            call.reject("provider_busy");
        }
    }

    private BuiltInCameraController cameraController() {
        if (cameraController == null) {
            cameraController = new BuiltInCameraController(getActivity(), control -> {
                JSObject event = new JSObject();
                event.put("control", control);
                notifyListeners("cameraControl", event);
            });
        }
        return cameraController;
    }

    private BuiltInBrowserController browserController() {
        if (browserController == null) {
            browserController = new BuiltInBrowserController(getActivity(), (eventName, url, title, progress) -> {
                JSObject event = new JSObject();
                event.put("event", eventName);
                event.put("url", url);
                event.put("title", title);
                event.put("progress", progress);
                notifyListeners("browserState", event);
            });
        }
        return browserController;
    }

    @PluginMethod public void getDumbModeState(PluginCall call) { dumbMode.getState(call); }
    @PluginMethod public void getDumbModeApps(PluginCall call) { dumbMode.getApps(call); }
    @PluginMethod public void prepareDumbMode(PluginCall call) { dumbMode.prepare(call, this); }
    @PluginMethod public void shareDumbModeCode(PluginCall call) { dumbMode.share(call, this, getActivity()); }
    @PluginMethod public void activateDumbMode(PluginCall call) { dumbMode.activate(call, this); }
    @PluginMethod public void cancelDumbModeSetup(PluginCall call) { dumbMode.cancel(call, this); }
    @PluginMethod public void unlockDumbMode(PluginCall call) { dumbMode.unlock(call); }
    @PluginMethod public void getFriendAuthenticatorState(PluginCall call) { dumbMode.friendOperation("getFriendAuthenticatorState", call, this); }
    @PluginMethod public void beginFriendPairing(PluginCall call) { dumbMode.friendOperation("beginFriendPairing", call, this); }
    @PluginMethod public void acceptFriendPairing(PluginCall call) { dumbMode.friendOperation("acceptFriendPairing", call, this); }
    @PluginMethod public void inspectFriendPairing(PluginCall call) { dumbMode.friendOperation("inspectFriendPairing", call, this); }
    @PluginMethod public void completeFriendPairing(PluginCall call) { dumbMode.friendOperation("completeFriendPairing", call, this); }
    @PluginMethod public void acknowledgeFriendPairing(PluginCall call) { dumbMode.friendOperation("acknowledgeFriendPairing", call, this); }
    @PluginMethod public void cancelFriendPairing(PluginCall call) { dumbMode.friendOperation("cancelFriendPairing", call, this); }
    @PluginMethod public void removeFriendPairing(PluginCall call) { dumbMode.friendOperation("removeFriendPairing", call, this); }
    @PluginMethod public void getHeldFriendCode(PluginCall call) { dumbMode.friendOperation("getHeldFriendCode", call, this); }

    @PluginMethod public void getFriendPairingQr(PluginCall call) {
        try {
            com.nokialauncher.dumbmode.PairingProtocol.validatePublicPayload(call.getString("payload"));
            if (destroyed || getActivity() == null) { call.reject("plugin_destroyed"); return; }
            pairingQrController().renderQr(call);
        } catch (Exception invalid) { call.reject("invalid_pairing_payload"); }
    }
    private com.nokialauncher.dumbmode.PairingQrController pairingQrController() {
        if (pairingQr == null) pairingQr = new com.nokialauncher.dumbmode.PairingQrController(getActivity());
        return pairingQr;
    }
    @PluginMethod public void startFriendPairingScan(PluginCall call) {
        if (destroyed || getActivity() == null) { call.reject("plugin_destroyed"); return; }
        pendingPairingScanId = call.getString("scanId");
        if (pendingPairingScanId == null || pendingPairingScanId.length() > 100) { call.reject("invalid_scan_id"); return; }
        call.getData().put("scanGeneration", ++pairingScanGeneration);
        if (cameraController != null) cameraController.pauseForBackground();
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "friendPairingCameraPermissionCallback");
            return;
        }
        pairingQrController().start(call);
    }
    @PermissionCallback private void friendPairingCameraPermissionCallback(PluginCall call) {
        if (destroyed || getActivity() == null || call.getData().optLong("scanGeneration", -1) != pairingScanGeneration
                || !java.util.Objects.equals(pendingPairingScanId, call.getString("scanId"))) {
            call.reject("pairing_scan_cancelled"); return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) { call.reject("camera_permission_denied"); return; }
        pairingQrController().start(call);
    }
    @PluginMethod public void stopFriendPairingScan(PluginCall call) {
        if (!java.util.Objects.equals(pendingPairingScanId, call.getString("scanId"))) { call.resolve(); return; }
        pairingScanGeneration++;
        pendingPairingScanId = null;
        if (pairingQr != null) pairingQr.stop(call); else call.resolve();
    }
    @PluginMethod public void shareFriendPairingText(PluginCall call) {
        final String payload = call.getString("payload");
        try { com.nokialauncher.dumbmode.PairingProtocol.validatePublicPayload(payload); }
        catch (Exception invalid) { call.reject("invalid_pairing_payload"); return; }
        android.app.Activity activity = getActivity();
        if (activity == null || destroyed) { call.reject("activity_unavailable"); return; }
        activity.runOnUiThread(() -> {
            if (destroyed || activity.isFinishing()) { call.reject("activity_unavailable"); return; }
            try {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, payload);
                activity.startActivity(Intent.createChooser(send, "Share friend pairing")); call.resolve();
            } catch (Exception unavailable) { call.reject("share_unavailable"); }
        });
    }
    @PluginMethod public void pasteFriendPairingText(PluginCall call) {
        android.app.Activity activity = getActivity();
        if (activity == null || destroyed) { call.reject("clipboard_unavailable"); return; }
        activity.runOnUiThread(() -> {
            try {
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                android.content.ClipData clip = clipboard != null ? clipboard.getPrimaryClip() : null;
                CharSequence value = clip != null && clip.getItemCount() > 0 ? clip.getItemAt(0).getText() : null;
                if (value == null || value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 2048) {
                    call.reject("clipboard_pairing_invalid"); return;
                }
                JSObject result = new JSObject(); result.put("text", value.toString().trim()); call.resolve(result);
            } catch (Exception failure) { call.reject("clipboard_unavailable"); }
        });
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        executeProviderTask(call, () -> loadInstalledApps(call));
    }

    private void loadInstalledApps(PluginCall call) {
        PackageManager packageManager = getContext().getPackageManager();
        Intent launcherIntent = new Intent(Intent.ACTION_MAIN, null);
        launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> resolveInfos = packageManager.queryIntentActivities(launcherIntent, 0);
        List<LauncherAppInfo> launcherApps = new ArrayList<>();
        String ownPackageName = getContext().getPackageName();

        for (ResolveInfo resolveInfo : resolveInfos) {
            if (resolveInfo.activityInfo == null) {
                continue;
            }

            String packageName = resolveInfo.activityInfo.packageName;
            if (ownPackageName.equals(packageName)) {
                continue;
            }

            CharSequence labelSeq = resolveInfo.loadLabel(packageManager);
            String label = labelSeq != null ? labelSeq.toString().trim() : "";
            if (label.isEmpty()) {
                label = packageName;
            }

            String activityName = resolveInfo.activityInfo.name;
            if (activityName == null) {
                activityName = "";
            }

            launcherApps.add(new LauncherAppInfo(resolveInfo, label, packageName, activityName));
        }

        Collator collator = Collator.getInstance(Locale.getDefault());
        Collections.sort(launcherApps, (left, right) -> collator.compare(left.label, right.label));

        JSONArray apps = new JSONArray();
        for (LauncherAppInfo launcherApp : launcherApps) {
            JSObject app = new JSObject();
            app.put("id", launcherApp.packageName + "/" + launcherApp.activityName);
            app.put("name", launcherApp.label);
            app.put("packageName", launcherApp.packageName);
            app.put("activityName", launcherApp.activityName);
            app.put("category", isLikelyEssential(launcherApp.packageName) ? "important" : "unimportant");
            int androidCategory = com.nokialauncher.dumbmode.DumbModeController.category(launcherApp.resolveInfo.activityInfo.applicationInfo);
            app.put("androidCategory", androidCategory);
            app.put("categoryGroup", com.nokialauncher.dumbmode.DumbModePolicy.group(androidCategory));
            app.put("is_system", isSystemApp(launcherApp.resolveInfo));
            apps.put(app);
        }

        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String packageName = call.getString("packageName");
        String restriction = com.nokialauncher.dumbmode.DumbModeController.get(getContext()).launchError(packageName);
        if (restriction != null) { call.reject(restriction, restriction); return; }
        String activityName = call.getString("activityName");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("packageName is required");
            return;
        }

        try {
            PackageManager packageManager = getContext().getPackageManager();
            Intent launchIntent;
            if (activityName != null && !activityName.trim().isEmpty()) {
                launchIntent = new Intent(Intent.ACTION_MAIN);
                launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                launchIntent.setComponent(new ComponentName(packageName, activityName));
                // Updates can replace an app's launcher activity or alias.
                if (packageManager.resolveActivity(launchIntent, 0) == null) {
                    launchIntent = packageManager.getLaunchIntentForPackage(packageName);
                }
            } else {
                launchIntent = packageManager.getLaunchIntentForPackage(packageName);
            }
            if (launchIntent == null) {
                call.reject("app_unavailable");
                return;
            }
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            getContext().startActivity(launchIntent);
            call.resolve();
        } catch (RuntimeException failure) {
            // Package removal and profile restrictions must not kill the bridge.
            call.reject("app_launch_failed", failure);
        }
    }

    @PluginMethod
    public void openAppReview(PluginCall call) {
        android.app.Activity activity = getActivity();
        if (activity == null) { call.reject("activity_unavailable"); return; }
        activity.runOnUiThread(() -> {
            Uri listing = Uri.parse("https://play.google.com/store/apps/details?id=com.nokialauncher");
            try {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, listing).setPackage("com.android.vending"));
                } catch (android.content.ActivityNotFoundException unavailable) {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, listing));
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("store_unavailable", error);
            }
        });
    }

    @PluginMethod
    public void shareApp(PluginCall call) {
        android.app.Activity activity = getActivity();
        if (activity == null) { call.reject("activity_unavailable"); return; }
        activity.runOnUiThread(() -> {
            try {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, "Nokia Launcher");
                send.putExtra(Intent.EXTRA_TEXT, "Try Nokia Launcher — a calmer way to use your phone. Make more room for life beyond the screen.\n\nhttps://play.google.com/store/apps/details?id=com.nokialauncher");
                activity.startActivity(Intent.createChooser(send, "Share Nokia Launcher"));
                // Opening the chooser does not imply a message was sent.
                call.resolve();
            } catch (Exception error) {
                call.reject("share_unavailable", error);
            }
        });
    }

    @PluginMethod
    public void makePhoneCall(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        if (getPermissionState("phone") != PermissionState.GRANTED) {
            requestPermissionForAlias("phone", call, "phonePermissionCallback");
            return;
        }

        placeDirectCall(call, number);
    }

    @PermissionCallback
    private void phonePermissionCallback(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            call.reject("phone_permission_denied");
            return;
        }
        String number = call.getString("number");
        if (number == null || number.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }
        placeDirectCall(call, number);
    }

    private void placeDirectCall(PluginCall call, String number) {
        try {
            Uri uri = Uri.fromParts("tel", number.trim(), null);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    TelecomManager telecomManager = (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);
                    if (telecomManager != null) {
                        Bundle extras = new Bundle();
                        // Let Telecom choose the user's default account. Avoid
                        // READ_PHONE_STATE: selecting a SIM is optional and the
                        // privileged query crashes on some OEMs when revoked.
                        if (getContext().checkSelfPermission(Manifest.permission.CALL_PHONE)
                            == PackageManager.PERMISSION_GRANTED) {
                            telecomManager.placeCall(uri, extras);
                            call.resolve();
                            return;
                        }
                    }
                } catch (Exception ignored) {}
            }
            Intent intent = new Intent(Intent.ACTION_CALL, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to make phone call: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
            return;
        }
        fetchContacts(call);
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("contacts_permission_denied");
            return;
        }
        fetchContacts(call);
    }

    private void fetchContacts(PluginCall call) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                ContentResolver resolver = context.getContentResolver();
                Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
                String[] projection = new String[] {
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                };
                String sortOrder = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " COLLATE LOCALIZED ASC";

                Cursor cursor = resolver.query(uri, projection, null, null, sortOrder);
                JSONArray contactsArray = new JSONArray();

                if (cursor != null) {
                    try {
                        int idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                        int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
                        int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

                        java.util.HashSet<String> seen = new java.util.HashSet<>();

                        while (cursor.moveToNext()) {
                            String id = idIndex != -1 ? cursor.getString(idIndex) : "";
                            String name = nameIndex != -1 ? cursor.getString(nameIndex) : "";
                            String number = numberIndex != -1 ? cursor.getString(numberIndex) : "";

                            if (name == null || name.trim().isEmpty()) {
                                name = number;
                            }
                            if (number == null || number.trim().isEmpty()) {
                                continue;
                            }

                            String cleanNumber = number.replaceAll("[^0-9+]", "");
                            String dedupKey = name.trim() + "|" + cleanNumber;
                            if (seen.contains(dedupKey)) {
                                continue;
                            }
                            seen.add(dedupKey);

                            JSObject contactObj = new JSObject();
                            contactObj.put("id", id + "_" + cleanNumber);
                            contactObj.put("name", name.trim());
                            contactObj.put("number", number.trim());
                            contactsArray.put(contactObj);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("contacts", contactsArray);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read contacts: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getRecentCalls(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("callLog", call, "callLogPermissionCallback");
            return;
        }
        if (callLogObserver == null) {
            registerCallLogObserver();
        }
        int limit = call.getInt("limit", 100);
        limit = limit <= 0 ? 100 : Math.min(limit, 100);
        fetchRecentCalls(call, limit);
    }

    @PermissionCallback
    private void callLogPermissionCallback(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            call.reject("call_log_permission_denied");
            return;
        }
        if (callLogObserver == null) {
            registerCallLogObserver();
        }
        int limit = call.getInt("limit", 100);
        limit = limit <= 0 ? 100 : Math.min(limit, 100);
        fetchRecentCalls(call, limit);
    }

    private void fetchRecentCalls(PluginCall call, int limit) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                ContentResolver resolver = context.getContentResolver();
                Uri uri = CallLog.Calls.CONTENT_URI;
                String[] projection = new String[] {
                    CallLog.Calls._ID,
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.CACHED_NAME,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                        ? CallLog.Calls.PHONE_ACCOUNT_ID
                        : CallLog.Calls._ID
                };
                String sortOrder = CallLog.Calls.DATE + " DESC";

                Cursor cursor = null;
                try {
                    cursor = resolver.query(uri, projection, null, null, sortOrder);
                } catch (Exception qEx) {
                    android.util.Log.w("LauncherAppsPlugin", "Recent calls query with full projection failed, retrying with basic projection", qEx);
                    String[] basicProjection = new String[] {
                        CallLog.Calls._ID,
                        CallLog.Calls.NUMBER,
                        CallLog.Calls.CACHED_NAME,
                        CallLog.Calls.TYPE,
                        CallLog.Calls.DATE,
                        CallLog.Calls.DURATION
                    };
                    cursor = resolver.query(uri, basicProjection, null, null, sortOrder);
                }

                JSONArray callsArray = new JSONArray();
                java.util.Map<String, String> contactNames = getPhoneNumberToNameMap(context);

                if (cursor != null) {
                    try {
                        int idIndex = cursor.getColumnIndex(CallLog.Calls._ID);
                        int numberIndex = cursor.getColumnIndex(CallLog.Calls.NUMBER);
                        int nameIndex = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME);
                        int typeIndex = cursor.getColumnIndex(CallLog.Calls.TYPE);
                        int dateIndex = cursor.getColumnIndex(CallLog.Calls.DATE);
                        int durationIndex = cursor.getColumnIndex(CallLog.Calls.DURATION);
                        int simIndex = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                            ? cursor.getColumnIndex(CallLog.Calls.PHONE_ACCOUNT_ID)
                            : -1;

                        int callCount = 0;
                        while (cursor.moveToNext() && callCount < limit) {
                            callCount++;
                            String id = idIndex != -1 ? cursor.getString(idIndex) : "";
                            String number = numberIndex != -1 ? cursor.getString(numberIndex) : "";
                            String name = nameIndex != -1 ? cursor.getString(nameIndex) : "";
                            int typeInt = typeIndex != -1 ? cursor.getInt(typeIndex) : 1;
                            long date = dateIndex != -1 ? cursor.getLong(dateIndex) : 0;
                            long duration = durationIndex != -1 ? cursor.getLong(durationIndex) : 0;
                            String simId = (simIndex != -1) ? cursor.getString(simIndex) : "";

                            if ((name == null || name.trim().isEmpty()) && number != null) {
                                String clean = number.replaceAll("[^0-9+]", "");
                                if (contactNames.containsKey(clean)) {
                                    name = contactNames.get(clean);
                                } else if (clean.length() >= 9 && contactNames.containsKey(clean.substring(clean.length() - 9))) {
                                    name = contactNames.get(clean.substring(clean.length() - 9));
                                }
                            }

                            String callType = "incoming";
                            if (typeInt == CallLog.Calls.OUTGOING_TYPE) {
                                callType = "outgoing";
                            } else if (typeInt == CallLog.Calls.MISSED_TYPE) {
                                callType = "missed";
                            } else if (typeInt == CallLog.Calls.REJECTED_TYPE) {
                                callType = "rejected";
                            }

                            String simSlot = "SIM 1";
                            if (simId != null && (simId.contains("1") || simId.contains("2"))) {
                                simSlot = simId.contains("2") ? "SIM 2" : "SIM 1";
                            }

                            JSObject callObj = new JSObject();
                            callObj.put("id", id);
                            callObj.put("number", number != null ? number.trim() : "");
                            callObj.put("name", name != null ? name.trim() : "");
                            callObj.put("type", callType);
                            callObj.put("rawType", typeInt);
                            callObj.put("date", date);
                            callObj.put("duration", duration);
                            callObj.put("sim", simSlot);

                            callsArray.put(callObj);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("calls", callsArray);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read call log: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteRecentCall(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("Missing call id");
            return;
        }
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("callLog", call, "deleteCallLogPermissionCallback");
            return;
        }
        executeDeleteRecentCall(call, id);
    }

    @PermissionCallback
    private void deleteCallLogPermissionCallback(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            call.reject("call_log_permission_denied");
            return;
        }
        String id = call.getString("id");
        executeDeleteRecentCall(call, id);
    }

    private void executeDeleteRecentCall(PluginCall call, String id) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }
                ContentResolver resolver = context.getContentResolver();
                int deleted = resolver.delete(
                    CallLog.Calls.CONTENT_URI,
                    CallLog.Calls._ID + " = ?",
                    new String[]{ id }
                );
                JSObject ret = new JSObject();
                ret.put("success", deleted > 0);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    private final Object contactCacheLock = new Object();
    private java.util.Map<String, String> cachedContactNames = null;
    private long lastContactFetchTime = 0;

    private java.util.Map<String, String> getPhoneNumberToNameMap(Context context) {
        synchronized (contactCacheLock) {
            if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                cachedContactNames = null;
                return Collections.emptyMap();
            }
            if (cachedContactNames != null && (android.os.SystemClock.elapsedRealtime() - lastContactFetchTime < 30000)) {
                return cachedContactNames;
            }
            java.util.Map<String, String> map = new java.util.HashMap<>();
            try {
                ContentResolver resolver = context.getContentResolver();
                Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
                String[] projection = new String[] {
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                };
                Cursor cursor = resolver.query(uri, projection, null, null, null);
                if (cursor != null) {
                    try {
                        int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
                        int numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                        int scannedContacts = 0;
                        while (scannedContacts++ < 10000 && !Thread.currentThread().isInterrupted() && cursor.moveToNext()) {
                            String name = nameIdx != -1 ? cursor.getString(nameIdx) : "";
                            String number = numIdx != -1 ? cursor.getString(numIdx) : "";
                            if (number != null && !number.trim().isEmpty() && name != null && !name.trim().isEmpty()) {
                                String clean = number.replaceAll("[^0-9+]", "");
                                map.put(clean, name.trim());
                                if (clean.length() >= 9) {
                                    map.put(clean.substring(clean.length() - 9), name.trim());
                                }
                            }
                        }
                    } finally {
                        cursor.close();
                    }
                }
            } catch (Exception ignored) {}
            cachedContactNames = map;
            lastContactFetchTime = android.os.SystemClock.elapsedRealtime();
            return map;
        }
    }

    @PluginMethod
    public void simulateIncomingSms(PluginCall call) {
        String address = call.getString("address", "198");
        String body = call.getString("body", "Test Instant Message");
        long date = System.currentTimeMillis();
        JSObject event = new JSObject();
        event.put("address", address);
        event.put("body", body);
        event.put("date", date);
        event.put("immediate", true);
        event.put("type", "simulated_sms");
        notifyListeners("smsReceived", event);
        call.resolve();
    }

    @PluginMethod
    public void getConversations(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "conversationsPermissionCallback");
            return;
        }
        fetchConversations(call);
    }

    @PermissionCallback
    private void conversationsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("sms_permission_denied");
            return;
        }
        initSmsListeners();
        fetchConversations(call);
    }

    private void fetchConversations(PluginCall call) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                java.util.Map<String, String> contactNames = getPhoneNumberToNameMap(context);

                ContentResolver resolver = context.getContentResolver();
                Uri uri = Uri.parse("content://sms");
                String[] projection = new String[] {
                    "_id", "thread_id", "address", "body", "date", "type", "read"
                };
                String sortOrder = "date DESC";

                Cursor cursor = resolver.query(uri, projection, null, null, sortOrder);
                JSONArray conversationsArray = new JSONArray();

                if (cursor != null) {
                    try {
                        int idIdx = cursor.getColumnIndex("_id");
                        int threadIdx = cursor.getColumnIndex("thread_id");
                        int addrIdx = cursor.getColumnIndex("address");
                        int bodyIdx = cursor.getColumnIndex("body");
                        int dateIdx = cursor.getColumnIndex("date");
                        int typeIdx = cursor.getColumnIndex("type");
                        int readIdx = cursor.getColumnIndex("read");

                        java.util.LinkedHashMap<String, JSObject> threadMap = new java.util.LinkedHashMap<>();

                        int scannedMessages = 0;
                        while (scannedMessages++ < 1000 && !Thread.currentThread().isInterrupted() && cursor.moveToNext()) {
                            String threadId = threadIdx != -1 ? cursor.getString(threadIdx) : "";
                            String address = addrIdx != -1 ? cursor.getString(addrIdx) : "";
                            if (address == null) address = "";
                            String cleanAddress = address.replaceAll("[^0-9+]", "");
                            String groupKey = (threadId != null && !threadId.isEmpty() && !threadId.equals("0"))
                                ? threadId
                                : (cleanAddress.isEmpty() ? address : cleanAddress);

                            if (groupKey.isEmpty() || threadMap.containsKey(groupKey)) {
                                continue;
                            }

                            String id = idIdx != -1 ? cursor.getString(idIdx) : "";
                            String body = bodyIdx != -1 ? cursor.getString(bodyIdx) : "";
                            long date = dateIdx != -1 ? cursor.getLong(dateIdx) : 0L;
                            int type = typeIdx != -1 ? cursor.getInt(typeIdx) : 1;
                            int read = readIdx != -1 ? cursor.getInt(readIdx) : 1;

                            String contactName = address;
                            String last9 = cleanAddress.length() >= 9 ? cleanAddress.substring(cleanAddress.length() - 9) : null;
                            if (contactNames.containsKey(cleanAddress)) {
                                contactName = contactNames.get(cleanAddress);
                            } else if (last9 != null && contactNames.containsKey(last9)) {
                                contactName = contactNames.get(last9);
                            }

                            JSObject conv = new JSObject();
                            conv.put("id", id);
                            conv.put("threadId", threadId);
                            conv.put("address", address);
                            conv.put("contactName", contactName);
                            conv.put("snippet", body != null ? body : "");
                            conv.put("date", date);
                            conv.put("type", type);
                            conv.put("unread", read == 0);

                            threadMap.put(groupKey, conv);
                            if (threadMap.size() >= 200) {
                                break;
                            }
                        }

                        for (JSObject obj : threadMap.values()) {
                            conversationsArray.put(obj);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("conversations", conversationsArray);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read conversations: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void getThreadMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "threadPermissionCallback");
            return;
        }
        fetchThreadMessages(call);
    }

    @PermissionCallback
    private void threadPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("sms_permission_denied");
            return;
        }
        fetchThreadMessages(call);
    }

    private void fetchThreadMessages(PluginCall call) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                String threadId = call.getString("threadId", "");
                String address = call.getString("address", "");

                ContentResolver resolver = context.getContentResolver();
                Uri uri = Uri.parse("content://sms");
                String[] projection = new String[] {
                    "_id", "thread_id", "address", "body", "date", "type", "read"
                };

                String selection = null;
                String[] selectionArgs = null;

                if (threadId != null && !threadId.trim().isEmpty() && !threadId.equals("0")) {
                    try {
                        Long.parseLong(threadId);
                        selection = "thread_id = ?";
                        selectionArgs = new String[] { threadId };
                    } catch (NumberFormatException nfe) {
                        if (address == null || address.trim().isEmpty()) {
                            address = threadId;
                        }
                    }
                }

                if (selection == null && address != null && !address.trim().isEmpty()) {
                    String cleanAddress = address.replaceAll("[^0-9+]", "");
                    if (cleanAddress.length() >= 9) {
                        String queryDigits = cleanAddress.substring(cleanAddress.length() - 9);
                        selection = "address = ? OR address LIKE ?";
                        selectionArgs = new String[] { address, "%" + queryDigits };
                    } else {
                        selection = "address = ?";
                        selectionArgs = new String[] { address };
                    }
                }

                if (selection == null) {
                    call.reject("conversation_required");
                    return;
                }
                String sortOrder = "date DESC";
                Cursor cursor = resolver.query(uri, projection, selection, selectionArgs, sortOrder);

                JSONArray messagesArray = new JSONArray();
                java.util.ArrayList<JSObject> list = new java.util.ArrayList<>();

                if (cursor != null) {
                    try {
                        int idIdx = cursor.getColumnIndex("_id");
                        int addrIdx = cursor.getColumnIndex("address");
                        int bodyIdx = cursor.getColumnIndex("body");
                        int dateIdx = cursor.getColumnIndex("date");
                        int typeIdx = cursor.getColumnIndex("type");
                        int readIdx = cursor.getColumnIndex("read");

                        while (list.size() < 200 && !Thread.currentThread().isInterrupted() && cursor.moveToNext()) {
                            String id = idIdx != -1 ? cursor.getString(idIdx) : "";
                            String msgAddr = addrIdx != -1 ? cursor.getString(addrIdx) : address;
                            String body = bodyIdx != -1 ? cursor.getString(bodyIdx) : "";
                            long date = dateIdx != -1 ? cursor.getLong(dateIdx) : 0L;
                            int type = typeIdx != -1 ? cursor.getInt(typeIdx) : 1;
                            int read = readIdx != -1 ? cursor.getInt(readIdx) : 1;

                            JSObject msgObj = new JSObject();
                            msgObj.put("id", id);
                            msgObj.put("address", msgAddr);
                            msgObj.put("body", body != null ? body : "");
                            msgObj.put("date", date);
                            msgObj.put("type", type);
                            msgObj.put("unread", read == 0);
                            list.add(msgObj);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                // Also load MMS messages if threadId is valid
                if (threadId != null && !threadId.trim().isEmpty() && !threadId.equals("0")) {
                    try {
                        Uri mmsUri = Uri.parse("content://mms");
                        Cursor mmsCursor = resolver.query(mmsUri, new String[]{"_id", "date", "msg_box"}, "thread_id = ?", new String[]{threadId}, "date DESC");
                        if (mmsCursor != null) {
                            try {
                                int mmsIdIdx = mmsCursor.getColumnIndex("_id");
                                int mmsDateIdx = mmsCursor.getColumnIndex("date");
                                int mmsBoxIdx = mmsCursor.getColumnIndex("msg_box");
                                int scannedMms = 0;
                                int remainingImageBytes = 1024 * 1024;
                                while (scannedMms++ < 50 && !Thread.currentThread().isInterrupted() && mmsCursor.moveToNext()) {
                                    String mmsId = mmsIdIdx != -1 ? mmsCursor.getString(mmsIdIdx) : "";
                                    long mmsDate = mmsDateIdx != -1 ? mmsCursor.getLong(mmsDateIdx) * 1000L : 0L;
                                    int msgBox = mmsBoxIdx != -1 ? mmsCursor.getInt(mmsBoxIdx) : 1;
                                    int type = (msgBox == 2) ? 2 : 1;

                                    String mmsBody = "";
                                    String mmsImage = null;

                                    Cursor partCursor = resolver.query(Uri.parse("content://mms/part"), new String[]{"_id", "ct", "text"}, "mid = ?", new String[]{mmsId}, null);
                                    if (partCursor != null) {
                                        try {
                                            int partIdIdx = partCursor.getColumnIndex("_id");
                                            int ctIdx = partCursor.getColumnIndex("ct");
                                            int textIdx = partCursor.getColumnIndex("text");
                                            int scannedParts = 0;
                                            while (scannedParts++ < 32 && !Thread.currentThread().isInterrupted() && partCursor.moveToNext()) {
                                                String ct = ctIdx != -1 ? partCursor.getString(ctIdx) : "";
                                                if (ct != null && ct.startsWith("image/") && mmsImage == null && remainingImageBytes > 0) {
                                                    String partId = partIdIdx != -1 ? partCursor.getString(partIdIdx) : "";
                                                    if (partId != null && partId.matches("[0-9]+")) {
                                                        byte[] preview = readMmsPreview(resolver, Uri.parse("content://mms/part/" + partId));
                                                        if (preview != null && preview.length <= remainingImageBytes) {
                                                            remainingImageBytes -= preview.length;
                                                            mmsImage = "data:image/jpeg;base64," + android.util.Base64.encodeToString(preview, android.util.Base64.NO_WRAP);
                                                        }
                                                    }
                                                } else if (ct != null && ct.equals("text/plain") && textIdx != -1) {
                                                    mmsBody = partCursor.getString(textIdx);
                                                }
                                            }
                                        } finally {
                                            partCursor.close();
                                        }
                                    }
                                    if (mmsImage != null || (mmsBody != null && !mmsBody.isEmpty())) {
                                        JSObject mmsObj = new JSObject();
                                        mmsObj.put("id", "mms_" + mmsId);
                                        mmsObj.put("address", address);
                                        mmsObj.put("body", mmsBody != null ? mmsBody : "");
                                        mmsObj.put("imageUrl", mmsImage);
                                        mmsObj.put("date", mmsDate);
                                        mmsObj.put("type", type);
                                        mmsObj.put("unread", false);
                                        list.add(mmsObj);
                                    }
                                }
                            } finally {
                                mmsCursor.close();
                            }
                        }
                    } catch (Exception ignored) {}
                }

                // Sort chronological (earliest first)
                java.util.Collections.sort(list, (a, b) -> {
                    long d1 = a.optLong("date", 0L);
                    long d2 = b.optLong("date", 0L);
                    return Long.compare(d1, d2);
                });

                for (JSObject obj : list) {
                    messagesArray.put(obj);
                }

                JSObject ret = new JSObject();
                ret.put("messages", messagesArray);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read thread messages: " + e.getMessage(), e);
            }
        });
    }

    // Provider bytes and decoded pixels are bounded before crossing the WebView bridge.
    private byte[] readMmsPreview(ContentResolver resolver, Uri uri) {
        android.graphics.Bitmap bitmap = null;
        try (java.io.InputStream stream = resolver.openInputStream(uri)) {
            byte[] bytes = BoundedInputReader.read(stream, 4 * 1024 * 1024);
            if (bytes == null || bytes.length == 0) return null;
            android.graphics.BitmapFactory.Options options = new android.graphics.BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            int edge = Math.max(options.outWidth, options.outHeight);
            if (edge <= 0 || options.outWidth <= 0 || options.outHeight <= 0) return null;
            options.inSampleSize = 1;
            while (edge / options.inSampleSize > 256) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap == null) return null;
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            if (!bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, output)) return null;
            return output.size() <= 128 * 1024 ? output.toByteArray() : null;
        } catch (Exception malformedOrDenied) {
            return null;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    @PluginMethod
    public void markConversationRead(PluginCall call) {
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.resolve();
                    return;
                }
                String threadId = call.getString("threadId", "");
                String address = call.getString("address", "");
                ContentResolver resolver = context.getContentResolver();
                Uri uri = Uri.parse("content://sms");
                String selection = null;
                String[] selectionArgs = null;

                if (threadId != null && !threadId.trim().isEmpty() && !threadId.equals("0")) {
                    try {
                        Long.parseLong(threadId);
                        selection = "thread_id = ?";
                        selectionArgs = new String[] { threadId };
                    } catch (NumberFormatException ignored) {}
                }
                if (selection == null && address != null && !address.trim().isEmpty()) {
                    String cleanAddress = address.replaceAll("[^0-9+]", "");
                    if (cleanAddress.length() >= 9) {
                        String queryDigits = cleanAddress.substring(cleanAddress.length() - 9);
                        selection = "address = ? OR address LIKE ?";
                        selectionArgs = new String[] { address, "%" + queryDigits };
                    } else {
                        selection = "address = ?";
                        selectionArgs = new String[] { address };
                    }
                }
                if (selection == null) { call.reject("conversation_required"); return; }
                ContentValues cv = new ContentValues();
                cv.put("read", 1);
                String markSelection = "(" + selection + ") AND read = 0";
                resolver.update(uri, cv, markSelection, selectionArgs);
                call.resolve();
            } catch (Exception e) {
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String address = call.getString("address", "");
        String body = call.getString("body", "");
        if (address == null || address.trim().isEmpty()) {
            call.reject("Recipient address is required");
            return;
        }
        if (!SmsSendState.acceptableBody(body)) {
            call.reject(body == null || body.trim().isEmpty() ? "Message body is required" : "sms_body_too_long");
            return;
        }

        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "sendSmsPermissionCallback");
            return;
        }
        executeSendSms(call, address, body);
    }

    @PermissionCallback
    private void sendSmsPermissionCallback(PluginCall call) {
        String address = call.getString("address", "");
        String body = call.getString("body", "");
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("sms_permission_denied");
            return;
        }
        executeSendSms(call, address, body);
    }

    private void executeSendSms(PluginCall call, String address, String body) {
        if (!SmsSendState.acceptableBody(body)) {
            call.reject("sms_body_too_long");
            return;
        }
        executeProviderTask(call, () -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                String targetNumber = SmsSendState.recipient(address);
                if (targetNumber.isEmpty()) {
                    call.reject("sms_recipient_required");
                    return;
                }

                SmsManager smsManager = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        smsManager = context.getSystemService(SmsManager.class);
                    } catch (Exception ignored) {}
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try {
                        int subId = SubscriptionManager.getDefaultSmsSubscriptionId();
                        if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                            smsManager = SmsManager.getSmsManagerForSubscriptionId(subId);
                        }
                    } catch (Exception ignored) {}
                }
                if (smsManager == null) {
                    smsManager = SmsManager.getDefault();
                }

                if (smsSender == null) { call.reject("sms_sender_unavailable"); return; }
                smsSender.send(smsManager, targetNumber, body, call);
            } catch (Exception e) {
                call.reject("sms_send_failed");
            }
        });
    }

    private void launchSmsIntentFallback(String address, String body) {
        try {
            Context context = getContext();
            if (context != null) {
                Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(address)));
                intent.putExtra("sms_body", body);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void getNotificationConversations(PluginCall call) {
        try {
            Context context = getContext();
            if (context != null) {
                NokiaNotificationListener.ensureBound(context);
            }
            List<NokiaNotificationListener.NotificationConversation> list = NokiaNotificationListener.getActiveConversations();
            JSONArray array = new JSONArray();
            if (list != null) {
                for (NokiaNotificationListener.NotificationConversation conv : list) {
                    JSObject obj = new JSObject();
                    obj.put("id", conv.id);
                    obj.put("threadId", conv.threadId);
                    obj.put("address", conv.address);
                    obj.put("contactName", conv.contactName);
                    obj.put("appTag", conv.appTag);
                    obj.put("appName", conv.appName);
                    obj.put("packageName", conv.packageName);
                    obj.put("notificationKey", conv.notificationKey);
                    obj.put("snippet", conv.snippet);
                    obj.put("date", conv.date);
                    obj.put("unread", conv.unread);
                    obj.put("canReply", conv.canReply);
                    obj.put("imageUrl", conv.imageUrl);
                    obj.put("source", "notification");
                    array.put(obj);
                }
            }
            JSObject ret = new JSObject();
            ret.put("conversations", array);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get notification conversations: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void replyNotificationMessage(PluginCall call) {
        String key = call.getString("notificationKey", "");
        String body = call.getString("body", "");
        if (key == null || key.trim().isEmpty()) {
            call.reject("notificationKey is required");
            return;
        }
        if (body == null || body.trim().isEmpty()) {
            call.reject("body is required");
            return;
        }

        Context context = getContext();
        if (context == null) {
            call.reject("Context is null");
            return;
        }

        boolean success = NokiaNotificationListener.reply(context, key, body);
        JSObject ret = new JSObject();
        ret.put("success", success);
        if (!success) {
            ret.put("error", "Reply action unavailable or notification dismissed");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteConversation(PluginCall call) {
        String threadId = call.getString("threadId", "");
        String address = call.getString("address", "");
        String notificationKey = call.getString("notificationKey", "");
        String source = call.getString("source", "");
        executeProviderTask(call, () -> {
            boolean deleted = false;
            try {
                if ((notificationKey != null && !notificationKey.trim().isEmpty()) || "notification".equals(source)) {
                    deleted = NokiaNotificationListener.dismissNotification(notificationKey);
                } else {
                    Context context = getContext();
                    if (context == null) { call.reject("context_unavailable"); return; }
                    ContentResolver resolver = context.getContentResolver();
                    if (threadId != null && threadId.matches("[1-9][0-9]*")) {
                        deleted = resolver.delete(Uri.parse("content://sms"), "thread_id = ?", new String[]{threadId}) > 0;
                        deleted = resolver.delete(Uri.parse("content://mms"), "thread_id = ?", new String[]{threadId}) > 0 || deleted;
                    } else if (address != null && !address.trim().isEmpty()) {
                        deleted = resolver.delete(Uri.parse("content://sms"), "address = ?", new String[]{address}) > 0;
                    } else { call.reject("conversation_required"); return; }
                }
                JSObject result = new JSObject();
                result.put("success", deleted);
                result.put("deleted", deleted);
                call.resolve(result);
            } catch (Exception deniedOrUnavailable) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("deleted", deleted);
                result.put("error", "delete_failed_or_partial");
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void deleteMessage(PluginCall call) {
        String messageId = call.getString("id", "");
        String notificationKey = call.getString("notificationKey", "");
        executeProviderTask(call, () -> {
            try {
                boolean deleted;
                if (notificationKey != null && !notificationKey.trim().isEmpty()) {
                    deleted = NokiaNotificationListener.dismissNotification(notificationKey);
                } else {
                    Context context = getContext();
                    if (context == null) { call.reject("context_unavailable"); return; }
                    boolean mms = messageId != null && messageId.startsWith("mms_");
                    String providerId = mms ? messageId.substring(4) : messageId;
                    if (providerId == null || !providerId.matches("[1-9][0-9]*")) {
                        call.reject("message_id_required"); return;
                    }
                    Uri uri = Uri.parse(mms ? "content://mms" : "content://sms");
                    deleted = context.getContentResolver().delete(uri, "_id = ?", new String[]{providerId}) > 0;
                }
                JSObject result = new JSObject();
                result.put("success", deleted);
                result.put("deleted", deleted);
                call.resolve(result);
            } catch (Exception deniedOrUnavailable) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "delete_failed");
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void checkNotificationAccess(PluginCall call) {
        Context context = getContext();
        boolean hasAccess = context != null && NokiaNotificationListener.hasAccess(context);
        if (hasAccess) {
            NokiaNotificationListener.ensureBound(context);
        }
        JSObject ret = new JSObject();
        ret.put("hasAccess", hasAccess);
        call.resolve(ret);
    }

    @PluginMethod
    public void simulateIncomingNotification(PluginCall call) {
        String pkg = call.getString("package", "com.whatsapp");
        String sender = call.getString("sender", "Sarah");
        String body = call.getString("body", "Hey, do you have the project doc?");
        long date = System.currentTimeMillis();
        String appTag = NokiaNotificationListener.resolveAppTag(getContext(), pkg);
        String appName = NokiaNotificationListener.resolveAppName(getContext(), pkg);

        NokiaNotificationListener.NotificationConversation conv = new NokiaNotificationListener.NotificationConversation();
        conv.id = "simulated_" + date;
        conv.threadId = "notif_" + pkg + "_" + sender;
        conv.address = sender;
        conv.contactName = sender;
        conv.appTag = appTag;
        conv.appName = appName;
        conv.packageName = pkg;
        conv.notificationKey = "simulated_" + date;
        conv.snippet = body;
        conv.date = date;
        conv.msgCount = 1;
        conv.unread = true;
        conv.canReply = true;

        JSObject event = new JSObject();
        event.put("id", conv.id);
        event.put("threadId", conv.threadId);
        event.put("address", conv.address);
        event.put("contactName", conv.contactName);
        event.put("appTag", conv.appTag);
        event.put("appName", conv.appName);
        event.put("packageName", conv.packageName);
        event.put("notificationKey", conv.notificationKey);
        event.put("body", body);
        event.put("snippet", conv.snippet);
        event.put("date", conv.date);
        event.put("canReply", conv.canReply);
        event.put("source", "notification");
        notifyListeners("notificationMessageReceived", event);

        JSObject ret = new JSObject();
        ret.put("simulated", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void openDefaultPhone(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open phone app: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openDefaultMaps(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q="));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception primaryError) {
            try {
                Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.google.com"));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception fallbackError) {
                call.reject("Failed to open maps app: " + fallbackError.getMessage(), fallbackError);
            }
        }
    }

    @PluginMethod
    public void selectDefaultApp(PluginCall call) {
        String type = call.getString("type", "");
        Context context = getContext();
        if (context == null) {
            call.reject("Context is null");
            return;
        }

        try {
            Intent intent;
            if ("maps".equalsIgnoreCase(type) || "map".equalsIgnoreCase(type)) {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q="));
            } else {
                intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"));
            }

            intent.setClassName("android", "com.android.internal.app.ResolverActivity");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            try {
                context.startActivity(intent);
                call.resolve();
                return;
            } catch (Exception resolverError) {
                // Fallback: strip component if ResolverActivity direct invocation is blocked
                Intent fallback = new Intent(intent);
                fallback.setComponent(null);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                call.resolve();
            }
        } catch (Exception e) {
            call.reject("Failed to open with: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getDeviceStatus(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        boolean wifi = false;
        boolean vpn = false;
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity != null) {
            Network activeNetwork = connectivity.getActiveNetwork();
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(activeNetwork);
            if (capabilities != null) {
                wifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
                vpn = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
            }
        }

        Boolean bluetooth = null;
        try {
            // Some OEM Bluetooth binder implementations require a permission even
            // for getAdapter()/isEnabled(). Status is optional; never crash Home.
            BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
            if (adapter != null) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                    bluetooth = adapter.isEnabled();
                } else {
                    bluetooth = Settings.Global.getInt(context.getContentResolver(), "bluetooth_on", 0) == 1;
                }
            }
        } catch (SecurityException ignored) {
            // Unknown is represented by null in the existing UI contract.
        }

        Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = battery != null ? battery.getIntExtra(BatteryManager.EXTRA_LEVEL, 100) : 100;
        int scale = battery != null ? battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100) : 100;
        int batteryLevel = scale > 0 ? Math.round(level * 100f / scale) : 100;
        int plugged = battery != null ? battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) : 0;

        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

        result.put("wifi", wifi);
        result.put("vpn", vpn);
        result.put("bluetooth", bluetooth);
        result.put("batteryLevel", batteryLevel);
        // Public operator label; no new permission or per-key bridge request.
        String carrierName = "";
        try {
            android.telephony.TelephonyManager telephony =
                (android.telephony.TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
            if (telephony != null) carrierName = telephony.getNetworkOperatorName();
        } catch (RuntimeException ignored) {
            // Wi-Fi-only devices and vendor restrictions use the UI fallback.
        }
        result.put("carrierName", carrierName == null ? "" : carrierName);
        result.put("charging", plugged != 0);
        result.put("powerSave", power != null && power.isPowerSaveMode());
        result.put("silent", audio != null && audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL);
        result.put("sirenMuted", audio != null && audio.getStreamVolume(AudioManager.STREAM_ALARM) == 0);
        result.put("notificationMode", getNotificationMode(audio));
        result.put("notificationCount", NokiaNotificationListener.getActiveNotificationCount());
        JSObject pkgCounts = new JSObject();
        for (java.util.Map.Entry<String, Integer> entry : NokiaNotificationListener.getPackageNotificationCounts().entrySet()) {
            pkgCounts.put(entry.getKey(), entry.getValue());
        }
        result.put("packageNotificationCounts", pkgCounts);
        result.put("notificationAccess", NokiaNotificationListener.hasAccess(context));
        call.resolve(result);
    }

    @PluginMethod
    public void toggleSirenSound(PluginCall call) {
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) {
                call.reject("Audio service unavailable");
                return;
            }
            boolean muted = audio.getStreamVolume(AudioManager.STREAM_ALARM) == 0;
            audio.adjustStreamVolume(
                AudioManager.STREAM_ALARM,
                muted ? AudioManager.ADJUST_UNMUTE : AudioManager.ADJUST_MUTE,
                0
            );
            JSObject result = new JSObject();
            result.put("sirenMuted", !muted);
            call.resolve(result);
        } catch (RuntimeException exception) {
            call.reject("audio_control_unavailable", exception);
        }
    }

    @PluginMethod
    public void cycleNotificationMode(PluginCall call) {
        try {
            android.app.NotificationManager manager = (android.app.NotificationManager)
                getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null
                    && !manager.isNotificationPolicyAccessGranted()) {
                Intent accessIntent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                accessIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(accessIntent);
                JSObject result = new JSObject();
                result.put("needsPolicyAccess", true);
                call.resolve(result);
                return;
            }

            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) {
                call.reject("Audio service unavailable");
                return;
            }
            int current = audio.getRingerMode();
            int next = current == AudioManager.RINGER_MODE_NORMAL
                ? AudioManager.RINGER_MODE_VIBRATE
                : current == AudioManager.RINGER_MODE_VIBRATE
                    ? AudioManager.RINGER_MODE_SILENT
                    : AudioManager.RINGER_MODE_NORMAL;
            audio.setRingerMode(next);
            JSObject result = new JSObject();
            result.put("notificationMode", getNotificationMode(audio));
            call.resolve(result);
        } catch (RuntimeException exception) {
            call.reject("audio_control_unavailable", exception);
        }
    }

    @PluginMethod
    public void openRecentApps(PluginCall call) {
        JSObject result = new JSObject();
        if (NokiaAccessibilityService.openRecentApps()) {
            result.put("opened", true);
            call.resolve(result);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            result.put("opened", false);
            result.put("needsActivation", true);
            call.resolve(result);
        } catch (Exception e) {
            result.put("opened", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void lockScreen(PluginCall call) {
        JSObject result = new JSObject();

        if (NokiaAccessibilityService.lockScreen()) {
            result.put("locked", true);
            result.put("method", "accessibility");
            call.resolve(result);
            return;
        }

        DevicePolicyManager policy = (DevicePolicyManager)
            getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(getContext(), NokiaDeviceAdminReceiver.class);
        if (policy != null && policy.isAdminActive(admin)) {
            try {
                policy.lockNow();
                result.put("locked", true);
                result.put("method", "device-admin");
                call.resolve(result);
                return;
            } catch (SecurityException ignored) {
            }
        }

        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            result.put("locked", false);
            result.put("needsActivation", true);
            call.resolve(result);
        } catch (Exception e) {
            result.put("locked", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    private String getNotificationMode(AudioManager audio) {
        if (audio == null) return "active";
        if (audio.getRingerMode() == AudioManager.RINGER_MODE_VIBRATE) return "vibrate";
        if (audio.getRingerMode() == AudioManager.RINGER_MODE_SILENT) return "muted";
        return "active";
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            Context context = getContext();
            Vibrator v = null;
            if (context != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    android.os.VibratorManager vm = (android.os.VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    v = vm != null ? vm.getDefaultVibrator() : null;
                } else {
                    v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                }
            }
            if (v != null && v.hasVibrator()) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .build();

                if (call.getData().has("pattern")) {
                    JSONArray jsonPattern = call.getArray("pattern");
                    if (jsonPattern != null && jsonPattern.length() > 0) {
                        int patternLength = Math.min(jsonPattern.length(), 20);
                        long[] pattern = new long[patternLength];
                        for (int i = 0; i < patternLength; i++) {
                            pattern[i] = Math.min(1000L, Math.max(0L, jsonPattern.optLong(i, 0)));
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            int[] amplitudes = new int[pattern.length];
                            for (int i = 0; i < amplitudes.length; i++) {
                                amplitudes[i] = (i % 2 == 1) ? 160 : 0;
                            }
                            VibrationEffect effect = VibrationEffect.createWaveform(pattern, amplitudes, -1);
                            if (audioAttributes != null) {
                                v.vibrate(effect, audioAttributes);
                            } else {
                                v.vibrate(effect);
                            }
                        } else {
                            v.vibrate(pattern, -1);
                        }
                        call.resolve();
                        return;
                    }
                }

                Integer durationParam = call.getInt("duration");
                int duration = Math.min(1000, Math.max(1, durationParam != null ? durationParam : 70));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    VibrationEffect effect = VibrationEffect.createOneShot(duration, 160);
                    if (audioAttributes != null) {
                        v.vibrate(effect, audioAttributes);
                    } else {
                        v.vibrate(effect);
                    }
                } else {
                    v.vibrate(duration);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void getSystemToneAccess(PluginCall call) {
        JSObject result = new JSObject();
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        result.put("supported", supported);
        result.put("granted", supported && Settings.System.canWrite(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void toggleFlashlight(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "flashlightPermissionCallback");
            return;
        }
        setFlashlight(call);
    }

    @PermissionCallback
    private void flashlightPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission is required for the flashlight");
            return;
        }
        setFlashlight(call);
    }

    private void setFlashlight(PluginCall call) {
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String torchCameraId = null;
            if (manager != null) {
                for (String cameraId : manager.getCameraIdList()) {
                    Boolean hasFlash = manager.getCameraCharacteristics(cameraId)
                        .get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    if (Boolean.TRUE.equals(hasFlash)) {
                        torchCameraId = cameraId;
                        break;
                    }
                }
            }
            if (manager == null || torchCameraId == null) {
                JSObject result = new JSObject();
                result.put("enabled", false);
                result.put("supported", false);
                call.resolve(result);
                return;
            }
            flashlightOn = !flashlightOn;
            manager.setTorchMode(torchCameraId, flashlightOn);
            JSObject result = new JSObject();
            result.put("enabled", flashlightOn);
            result.put("supported", true);
            call.resolve(result);
        } catch (CameraAccessException | SecurityException error) {
            call.reject("flashlight_unavailable", error);
        }
    }

    @PluginMethod
    public void requestSystemToneAccess(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            result.put("opened", false);
            result.put("supported", false);
            call.resolve(result);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            result.put("opened", true);
            result.put("supported", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to open system-tone access: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void applySystemTone(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        if (!Settings.System.canWrite(getContext())) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }

        final String rawToneType = call.getString("toneType");
        final String toneType = rawToneType != null ? rawToneType : "";
        final String rawAssetPathStr = call.getString("assetPath");
        final String rawAssetPath = rawAssetPathStr != null ? rawAssetPathStr : "";
        final String rawTitleStr = call.getString("title");
        final String rawTitle = rawTitleStr != null ? rawTitleStr : "Nokia Launcher tone";
        if (!("ringtone".equals(toneType) || "notification".equals(toneType) || "alarm".equals(toneType))) {
            call.reject("toneType must be ringtone, notification, or alarm");
            return;
        }

        String cleanAssetPath = rawAssetPath.startsWith("./")
            ? rawAssetPath.substring(2)
            : rawAssetPath;
        if (!cleanAssetPath.startsWith("sounds/")
            || cleanAssetPath.contains("..")
            || !cleanAssetPath.matches("[A-Za-z0-9_./-]+\\.(mp3|wav)")) {
            call.reject("Invalid packaged tone path");
            return;
        }

        final String assetPath = "public/" + cleanAssetPath;
        final String title = rawTitle.replaceAll("[^A-Za-z0-9 _.-]", "").trim();
        executeProviderTask(call, () -> applyPackagedSystemTone(call, toneType, assetPath, title));
    }

    private void applyPackagedSystemTone(PluginCall call, String toneType, String assetPath, String title) {
        Uri insertedUri = null;
        try {
            boolean ringtone = "ringtone".equals(toneType);
            boolean notification = "notification".equals(toneType);
            int ringtoneType = ringtone
                ? android.media.RingtoneManager.TYPE_RINGTONE
                : notification
                    ? android.media.RingtoneManager.TYPE_NOTIFICATION
                    : android.media.RingtoneManager.TYPE_ALARM;
            String extension = assetPath.toLowerCase(Locale.ROOT).endsWith(".wav") ? ".wav" : ".mp3";
            String mimeType = ".wav".equals(extension) ? "audio/wav" : "audio/mpeg";
            String safeTitle = title.isEmpty() ? "Nokia Launcher tone" : title.substring(0, Math.min(title.length(), 64));
            String fileName = "nokia_launcher_" + toneType + "_" + System.currentTimeMillis() + extension;

            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.Audio.Media.DISPLAY_NAME, fileName);
            values.put(android.provider.MediaStore.Audio.Media.TITLE, safeTitle);
            values.put(android.provider.MediaStore.Audio.Media.MIME_TYPE, mimeType);
            values.put(android.provider.MediaStore.Audio.Media.IS_RINGTONE, ringtone ? 1 : 0);
            values.put(android.provider.MediaStore.Audio.Media.IS_ALARM, ringtone || notification ? 0 : 1);
            values.put(android.provider.MediaStore.Audio.Media.IS_NOTIFICATION, notification ? 1 : 0);
            values.put(android.provider.MediaStore.Audio.Media.IS_MUSIC, 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(android.provider.MediaStore.Audio.Media.RELATIVE_PATH,
                    (ringtone
                        ? android.os.Environment.DIRECTORY_RINGTONES
                        : notification
                            ? android.os.Environment.DIRECTORY_NOTIFICATIONS
                            : android.os.Environment.DIRECTORY_ALARMS)
                        + "/Nokia Launcher");
                values.put(android.provider.MediaStore.Audio.Media.IS_PENDING, 1);
            }

            Uri collection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? android.provider.MediaStore.Audio.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            insertedUri = getContext().getContentResolver().insert(collection, values);
            if (insertedUri == null) throw new IllegalStateException("Unable to create system tone");

            try (java.io.InputStream input = getContext().getAssets().open(assetPath);
                 java.io.OutputStream output = getContext().getContentResolver().openOutputStream(insertedUri)) {
                if (output == null) throw new IllegalStateException("Unable to write system tone");
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues ready = new android.content.ContentValues();
                ready.put(android.provider.MediaStore.Audio.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(insertedUri, ready, null, null);
            }
            android.media.RingtoneManager.setActualDefaultRingtoneUri(
                getContext(), ringtoneType, insertedUri);

            String preferenceKey = "owned_system_tone_" + toneType;
            android.content.SharedPreferences preferences = getContext().getSharedPreferences(
                "nokia_launcher_tones", Context.MODE_PRIVATE);
            String previousUri = preferences.getString(preferenceKey, null);
            preferences.edit().putString(preferenceKey, insertedUri.toString()).apply();
            if (previousUri != null && !previousUri.equals(insertedUri.toString())) {
                try {
                    getContext().getContentResolver().delete(Uri.parse(previousUri), null, null);
                } catch (Exception ignored) {
                    // Delete only the exact URI previously inserted and owned by this app.
                }
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("uri", insertedUri.toString());
            call.resolve(result);
        } catch (Exception error) {
            if (insertedUri != null) {
                try { getContext().getContentResolver().delete(insertedUri, null, null); }
                catch (Exception ignored) {}
            }
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", error.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open notification access settings: " + e.getMessage(), e);
        }
    }


    @PluginMethod
    public void isDefaultLauncher(PluginCall call) {
        JSObject result = new JSObject();
        boolean isDefault = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                isDefault = roleManager.isRoleHeld(RoleManager.ROLE_HOME);
            }
        }
        if (!isDefault) {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_HOME);
            ResolveInfo resolveInfo = getContext().getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (resolveInfo != null && resolveInfo.activityInfo != null) {
                isDefault = getContext().getPackageName().equals(resolveInfo.activityInfo.packageName);
            }
        }
        result.put("isDefault", isDefault);
        call.resolve(result);
    }

    @PluginMethod
    public void requestDefaultLauncher(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                if (!roleManager.isRoleHeld(RoleManager.ROLE_HOME)) {
                    Intent roleIntent = roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME);
                    if (getActivity() != null) {
                        getActivity().startActivity(roleIntent);
                        JSObject result = new JSObject();
                        result.put("requested", true);
                        call.resolve(result);
                        return;
                    }
                } else {
                    JSObject result = new JSObject();
                    result.put("requested", false);
                    result.put("alreadyDefault", true);
                    call.resolve(result);
                    return;
                }
            }
        }
        try {
            Intent intent = new Intent(Settings.ACTION_HOME_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("requested", true);
            call.resolve(result);
        } catch (Exception e) {
            try {
                Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                    ? new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
                    : new Intent(Settings.ACTION_APPLICATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("requested", true);
                call.resolve(result);
            } catch (Exception fallbackErr) {
                call.reject("Cannot open default home settings: " + fallbackErr.getMessage());
            }
        }
    }

    @PluginMethod
    public void openSystemSetting(PluginCall call) {
        String rawSetting = call.getString("setting");
        String setting = rawSetting != null ? rawSetting : "settings";
        Intent intent;

        switch (setting) {
            case "default-launcher":
            case "home":
                intent = new Intent(Settings.ACTION_HOME_SETTINGS);
                break;
            case "launcher-settings":
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                break;
            case "display":
                intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
                break;
            case "sound":
                intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
                break;
            case "privacy":
                intent = new Intent("android.settings.PRIVACY_SETTINGS");
                break;
            case "digital-wellbeing":
                intent = new Intent("android.settings.WELLBEING_SETTINGS");
                if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                    intent = getContext().getPackageManager().getLaunchIntentForPackage("com.google.android.apps.wellbeing");
                }
                break;
            case "keyboard":
                intent = new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS);
                break;
            case "wifi":
                intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            case "bluetooth":
                intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                break;
            case "vpn":
                intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                    ? new Intent(Settings.ACTION_VPN_SETTINGS)
                    : new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                break;
            case "battery":
                intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
                break;
            case "network":
                intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                break;
            default:
                intent = new Intent(Settings.ACTION_SETTINGS);
                break;
        }

        try {
            if (intent == null) {
                call.reject(setting + " settings are not available on this device");
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception primaryError) {
            if ("default-launcher".equals(setting) || "home".equals(setting)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try {
                        Intent fallback = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(fallback);
                        call.resolve();
                        return;
                    } catch (Exception ignored) { }
                }
                call.reject("Home app settings are unavailable: " + primaryError.getMessage(), primaryError);
                return;
            }
            if ("launcher-settings".equals(setting)) {
                call.reject("Nokia Launcher app settings are unavailable: " + primaryError.getMessage(), primaryError);
                return;
            }
            if ("keyboard".equals(setting) || "digital-wellbeing".equals(setting) || "privacy".equals(setting)) {
                call.reject("Exact " + setting + " settings are unavailable: " + primaryError.getMessage(), primaryError);
                return;
            }
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception fallbackError) {
                call.reject("Failed to open " + setting + " settings: " + fallbackError.getMessage(), fallbackError);
            }
        }
    }

    @PluginMethod
    public void openWebUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            Uri uri = Uri.parse(url.trim());
            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                call.reject("Only http and https URLs are supported");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open web URL: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void showKeyboardSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open keyboard settings: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void showAccessibilitySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Intent details = new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS");
                details.putExtra(Intent.EXTRA_COMPONENT_NAME,
                    new android.content.ComponentName(getContext(), NokiaAccessibilityService.class));
                details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(details);
                call.resolve();
                return;
            } catch (android.content.ActivityNotFoundException | SecurityException unavailable) {
                // Some OEMs restrict the service-detail page. Open the supported list.
            }
        }
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open accessibility settings: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void pasteDumbModeCode(PluginCall call) {
        android.app.Activity activity = getActivity();
        if (activity == null) { call.reject("clipboard_code_unavailable"); return; }
        activity.runOnUiThread(() -> {
            try {
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
                    getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                android.content.ClipData clip = clipboard != null ? clipboard.getPrimaryClip() : null;
                CharSequence text = clip != null && clip.getItemCount() > 0 ? clip.getItemAt(0).getText() : null;
                if (text == null || text.length() > 64) { call.reject("clipboard_code_unavailable"); return; }
                String code = text.toString().trim();
                if (!code.matches("[A-Za-z0-9]{12}") && !code.replaceAll("\\s", "").matches("[0-9]{8}")) { call.reject("clipboard_code_invalid"); return; }
                JSObject result = new JSObject(); result.put("code", code); call.resolve(result);
            } catch (Exception failure) { call.reject("clipboard_code_unavailable"); }
        });
    }

    @PluginMethod
    public void showKeyboardPicker(PluginCall call) {
        try {
            InputMethodManager imm = (InputMethodManager) 
                getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.showInputMethodPicker();
                call.resolve();
            } else {
                call.reject("InputMethodManager not available");
            }
        } catch (Exception e) {
            call.reject("Failed to show keyboard picker: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void startBrowser(PluginCall call) {
        if (cameraController != null) cameraController.pauseForBackground();
        browserController().startBrowser(call);
    }

    @PluginMethod
    public void navigateBrowser(PluginCall call) {
        browserController().navigate(call);
    }

    @PluginMethod
    public void controlBrowser(PluginCall call) {
        browserController().control(call);
    }

    @PluginMethod
    public void updateBrowserSurfaceBounds(PluginCall call) {
        browserController().updateSurfaceBounds(call);
    }

    @PluginMethod
    public void stopBrowser(PluginCall call) {
        browserController().stopBrowser(call);
    }

    @PluginMethod
    public void startCamera(PluginCall call) {
        if (browserController != null) browserController.stop();
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }
        cameraController().startCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            cameraController().startCamera(call);
        } else {
            call.reject("camera_permission_denied");
        }
    }

    @PluginMethod
    public void updateCameraSurfaceBounds(PluginCall call) {
        cameraController().updateSurfaceBounds(call);
    }

    @PluginMethod
    public void setCameraLens(PluginCall call) {
        cameraController().setLens(call);
    }

    @PluginMethod
    public void setCameraFlash(PluginCall call) {
        cameraController().setFlash(call);
    }

    @PluginMethod
    public void setCameraMode(PluginCall call) {
        cameraController().setMode(call);
    }

    @PluginMethod
    public void setCameraGrid(PluginCall call) {
        cameraController().setGrid(call);
    }

    @PluginMethod
    public void capturePhoto(PluginCall call) {
        cameraController().capturePhoto(call);
    }

    @PluginMethod
    public void startVideo(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        cameraController().startVideo(call, true);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        cameraController().startVideo(call, granted);
    }

    @PluginMethod
    public void stopVideo(PluginCall call) {
        cameraController().stopVideo(call);
    }

    @PluginMethod
    public void stopCamera(PluginCall call) {
        cameraController().stopCamera(call);
    }

    @PluginMethod
    public void listCameraMedia(PluginCall call) {
        cameraController().listMedia(call);
    }

    @PluginMethod
    public void showCameraMedia(PluginCall call) {
        cameraController().showMedia(call);
    }

    @PluginMethod
    public void controlCameraMedia(PluginCall call) {
        cameraController().controlMedia(call);
    }

    @PluginMethod
    public void hideCameraMedia(PluginCall call) {
        cameraController().hideMedia(call);
    }

    private void triggerNativeKeyHaptic(int durationMs) {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                Vibrator vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    int duration = durationMs > 0 ? durationMs : 60;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(duration);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void triggerKeyHaptic(PluginCall call) {
        int duration = call.getInt("duration", 60);
        triggerNativeKeyHaptic(duration);
        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void playKeypadTone(PluginCall call) {
        String key = call.getString("key", "");
        int duration = call.getInt("duration", 200);
        boolean haptic = call.getBoolean("haptic", true);

        if (haptic) {
            triggerNativeKeyHaptic(60);
        }

        int tone = -1;
        switch (key) {
            case "0":
            // Navigator + D-pad keys produce the exact same tone as 0 in Nokia 1280 Launcher
            case "GREEN":
            case "CALL":
            case "SEND":
            case "END":
            case "RED":
            case "HOME":
            case "SOFT_LEFT":
            case "SOFT_RIGHT":
            case "GOTO":
            case "BACK":
            case "DELETE":
            case "UP":
            case "DOWN":
            case "LEFT":
            case "RIGHT":
            case "SELECT":
            case "TAB":
                tone = ToneGenerator.TONE_DTMF_0;
                break;
            case "1": tone = ToneGenerator.TONE_DTMF_1; break;
            case "2": tone = ToneGenerator.TONE_DTMF_2; break;
            case "3": tone = ToneGenerator.TONE_DTMF_3; break;
            case "4": tone = ToneGenerator.TONE_DTMF_4; break;
            case "5": tone = ToneGenerator.TONE_DTMF_5; break;
            case "6": tone = ToneGenerator.TONE_DTMF_6; break;
            case "7": tone = ToneGenerator.TONE_DTMF_7; break;
            case "8": tone = ToneGenerator.TONE_DTMF_8; break;
            case "9": tone = ToneGenerator.TONE_DTMF_9; break;
            case "*":
            case "STAR":
                tone = ToneGenerator.TONE_DTMF_S;
                break;
            case "#":
            case "HASH":
                tone = ToneGenerator.TONE_DTMF_P;
                break;
            default:
                tone = -1;
                break;
        }

        if (tone >= 0) {
            ToneGenerator tg = getToneGenerator();
            if (tg != null) {
                try {
                    tg.startTone(tone, duration);
                } catch (Exception e) {
                    releaseToneGenerator();
                    ToneGenerator retryTg = getToneGenerator();
                    if (retryTg != null) {
                        try {
                            retryTg.startTone(tone, duration);
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    private boolean isSystemApp(ResolveInfo resolveInfo) {
        ApplicationInfo applicationInfo = resolveInfo.activityInfo.applicationInfo;
        return (applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
    }

    private boolean isLikelyEssential(String packageName) {
        String normalized = packageName.toLowerCase(Locale.US);
        return normalized.contains("dialer")
            || normalized.contains("phone")
            || normalized.contains("contacts")
            || normalized.contains("messaging")
            || normalized.contains("messages")
            || normalized.contains("camera")
            || normalized.contains("calendar")
            || normalized.contains("maps")
            || normalized.contains("settings")
            || normalized.contains("clock");
    }

    private static class LauncherAppInfo {
        final ResolveInfo resolveInfo;
        final String label;
        final String packageName;
        final String activityName;

        LauncherAppInfo(ResolveInfo resolveInfo, String label, String packageName, String activityName) {
            this.resolveInfo = resolveInfo;
            this.label = label;
            this.packageName = packageName;
            this.activityName = activityName;
        }
    }
}
