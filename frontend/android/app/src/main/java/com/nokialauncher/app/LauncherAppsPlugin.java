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
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.telephony.SmsManager;
import android.view.inputmethod.InputMethodManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.nokialauncher.app.camera.BuiltInCameraController;
import com.nokialauncher.app.browser.BuiltInBrowserController;
import java.util.ArrayList;
import java.text.Collator;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;

@CapacitorPlugin(
    name = "LauncherApps",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS })
    }
)
public class LauncherAppsPlugin extends Plugin {
    private BuiltInCameraController cameraController;
    private BuiltInBrowserController browserController;
    private boolean flashlightOn = false;
    private ToneGenerator toneGenerator;

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

    @Override
    protected void handleOnPause() {
        if (cameraController != null) cameraController.pauseForBackground();
        if (browserController != null) browserController.pauseForBackground();
    }

    @Override
    protected void handleOnResume() {
        if (browserController != null) browserController.resumeFromBackground();
    }

    @Override
    protected void handleOnDestroy() {
        releaseToneGenerator();
        if (cameraController != null) {
            cameraController.destroy();
            cameraController = null;
        }
        if (browserController != null) {
            browserController.destroy();
            browserController = null;
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

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
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
        String activityName = call.getString("activityName");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("packageName is required");
            return;
        }

        PackageManager packageManager = getContext().getPackageManager();
        Intent launchIntent;
        if (activityName != null && !activityName.trim().isEmpty()) {
            launchIntent = new Intent(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            launchIntent.setComponent(new ComponentName(packageName, activityName));
        } else {
            launchIntent = packageManager.getLaunchIntentForPackage(packageName);
        }

        if (launchIntent == null) {
            call.reject("No launch intent found for " + packageName);
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        getContext().startActivity(launchIntent);
        call.resolve();
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
                        try {
                            android.telecom.PhoneAccountHandle defaultAccount = telecomManager.getUserSelectedOutgoingPhoneAccount();
                            if (defaultAccount != null) {
                                extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, defaultAccount);
                            }
                        } catch (Exception ignored) {}
                        telecomManager.placeCall(uri, extras);
                        call.resolve();
                        return;
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
        new Thread(() -> {
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
        }).start();
    }

    private java.util.Map<String, String> cachedContactNames = null;
    private long lastContactFetchTime = 0;

    private synchronized java.util.Map<String, String> getPhoneNumberToNameMap(Context context) {
        if (cachedContactNames != null && (System.currentTimeMillis() - lastContactFetchTime < 30000)) {
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
                    while (cursor.moveToNext()) {
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
        lastContactFetchTime = System.currentTimeMillis();
        return map;
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
        fetchConversations(call);
    }

    private void fetchConversations(PluginCall call) {
        new Thread(() -> {
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
                String sortOrder = "date DESC LIMIT 300";

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

                        while (cursor.moveToNext()) {
                            String threadId = threadIdx != -1 ? cursor.getString(threadIdx) : "";
                            String address = addrIdx != -1 ? cursor.getString(addrIdx) : "";
                            if (address == null) address = "";
                            String cleanAddr = address.replaceAll("[^0-9+]", "");
                            String groupKey = (threadId != null && !threadId.isEmpty() && !threadId.equals("0"))
                                ? threadId
                                : cleanAddr;

                            if (groupKey.isEmpty() || threadMap.containsKey(groupKey)) {
                                continue;
                            }

                            String id = idIdx != -1 ? cursor.getString(idIdx) : "";
                            String body = bodyIdx != -1 ? cursor.getString(bodyIdx) : "";
                            long date = dateIdx != -1 ? cursor.getLong(dateIdx) : 0L;
                            int type = typeIdx != -1 ? cursor.getInt(typeIdx) : 1;
                            int read = readIdx != -1 ? cursor.getInt(readIdx) : 1;

                            String contactName = address;
                            if (contactNames.containsKey(cleanAddr)) {
                                contactName = contactNames.get(cleanAddr);
                            } else if (cleanAddr.length() >= 9 && contactNames.containsKey(cleanAddr.substring(cleanAddr.length() - 9))) {
                                contactName = contactNames.get(cleanAddr.substring(cleanAddr.length() - 9));
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
                            if (threadMap.size() >= 50) {
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
        }).start();
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
        new Thread(() -> {
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
                    String cleanAddr = address.replaceAll("[^0-9+]", "");
                    if (!cleanAddr.isEmpty()) {
                        selection = "address LIKE ?";
                        selectionArgs = new String[] { "%" + (cleanAddr.length() >= 7 ? cleanAddr.substring(cleanAddr.length() - 7) : cleanAddr) + "%" };
                    } else {
                        selection = "address = ? OR address LIKE ?";
                        selectionArgs = new String[] { address, "%" + address + "%" };
                    }
                }

                String sortOrder = "date DESC LIMIT 50";
                Cursor cursor = resolver.query(uri, projection, selection, selectionArgs, sortOrder);
                JSONArray messagesArray = new JSONArray();

                if (cursor != null) {
                    try {
                        int idIdx = cursor.getColumnIndex("_id");
                        int addrIdx = cursor.getColumnIndex("address");
                        int bodyIdx = cursor.getColumnIndex("body");
                        int dateIdx = cursor.getColumnIndex("date");
                        int typeIdx = cursor.getColumnIndex("type");
                        int readIdx = cursor.getColumnIndex("read");

                        java.util.ArrayList<JSObject> list = new java.util.ArrayList<>();
                        while (cursor.moveToNext()) {
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
                        java.util.Collections.reverse(list);
                        for (JSObject obj : list) {
                            messagesArray.put(obj);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("messages", messagesArray);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read thread messages: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String address = call.getString("address", "");
        String body = call.getString("body", "");
        if (address == null || address.trim().isEmpty()) {
            call.reject("Recipient address is required");
            return;
        }
        if (body == null || body.trim().isEmpty()) {
            call.reject("Message body is required");
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
            launchSmsIntentFallback(address, body);
            JSObject ret = new JSObject();
            ret.put("sent", false);
            ret.put("fallback", true);
            call.resolve(ret);
            return;
        }
        executeSendSms(call, address, body);
    }

    private void executeSendSms(PluginCall call, String address, String body) {
        new Thread(() -> {
            try {
                Context context = getContext();
                if (context == null) {
                    call.reject("Context is null");
                    return;
                }

                SmsManager smsManager;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    smsManager = context.getSystemService(SmsManager.class);
                } else {
                    smsManager = SmsManager.getDefault();
                }

                ArrayList<String> parts = smsManager.divideMessage(body);
                if (parts.size() > 1) {
                    smsManager.sendMultipartTextMessage(address, null, parts, null, null);
                } else {
                    smsManager.sendTextMessage(address, null, body, null, null);
                }

                try {
                    ContentValues values = new ContentValues();
                    values.put("address", address);
                    values.put("body", body);
                    values.put("date", System.currentTimeMillis());
                    values.put("type", 2); // 2 = sent
                    values.put("read", 1);
                    context.getContentResolver().insert(Uri.parse("content://sms/sent"), values);
                } catch (Exception ignored) {}

                JSObject ret = new JSObject();
                ret.put("sent", true);
                ret.put("fallback", false);
                call.resolve(ret);
            } catch (Exception e) {
                launchSmsIntentFallback(address, body);
                JSObject ret = new JSObject();
                ret.put("sent", false);
                ret.put("fallback", true);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        }).start();
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
        BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        if (adapter != null) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                bluetooth = adapter.isEnabled();
            } else {
                bluetooth = Settings.Global.getInt(context.getContentResolver(), "bluetooth_on", 0) == 1;
            }
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
        result.put("notificationAccess", NokiaNotificationListener.hasAccess(context));
        call.resolve(result);
    }

    @PluginMethod
    public void toggleSirenSound(PluginCall call) {
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
    }

    @PluginMethod
    public void cycleNotificationMode(PluginCall call) {
        android.app.NotificationManager manager = (android.app.NotificationManager)
            getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && manager != null
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
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                AudioAttributes audioAttributes = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .build();
                }

                if (call.hasOption("pattern")) {
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

                int duration = Math.min(1000, Math.max(1, call.getInt("duration", 70)));
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject result = new JSObject();
            result.put("enabled", false);
            result.put("supported", false);
            call.resolve(result);
            return;
        }
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

        final String toneType = call.getString("toneType", "");
        final String rawAssetPath = call.getString("assetPath", "");
        final String rawTitle = call.getString("title", "Nokia Launcher tone");
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
        new Thread(() -> applyPackagedSystemTone(call, toneType, assetPath, title), "tone-apply").start();
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
            values.put(android.provider.MediaStore.Audio.Media.RELATIVE_PATH,
                (ringtone
                    ? android.os.Environment.DIRECTORY_RINGTONES
                    : notification
                        ? android.os.Environment.DIRECTORY_NOTIFICATIONS
                        : android.os.Environment.DIRECTORY_ALARMS)
                    + "/Nokia Launcher");
            values.put(android.provider.MediaStore.Audio.Media.IS_PENDING, 1);

            Uri collection = android.provider.MediaStore.Audio.Media.getContentUri(
                android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY);
            insertedUri = getContext().getContentResolver().insert(collection, values);
            if (insertedUri == null) throw new IllegalStateException("Unable to create system tone");

            try (java.io.InputStream input = getContext().getAssets().open(assetPath);
                 java.io.OutputStream output = getContext().getContentResolver().openOutputStream(insertedUri)) {
                if (output == null) throw new IllegalStateException("Unable to write system tone");
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
            }

            android.content.ContentValues ready = new android.content.ContentValues();
            ready.put(android.provider.MediaStore.Audio.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(insertedUri, ready, null, null);
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
                Intent intent = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
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
        String setting = call.getString("setting", "settings");
        Intent intent;

        switch (setting) {
            case "default-launcher":
            case "home":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
                    if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                        Intent roleIntent = roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME);
                        if (getActivity() != null) {
                            getActivity().startActivity(roleIntent);
                            call.resolve();
                            return;
                        }
                    }
                }
                intent = new Intent(Settings.ACTION_HOME_SETTINGS);
                if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                    intent = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                }
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
                intent = new Intent(Settings.ACTION_VPN_SETTINGS);
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
