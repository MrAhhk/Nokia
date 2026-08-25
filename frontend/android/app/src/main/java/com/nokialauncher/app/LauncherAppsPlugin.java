package com.nokialauncher;

import android.Manifest;
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
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
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
        @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE })
    }
)
public class LauncherAppsPlugin extends Plugin {
    private BuiltInCameraController cameraController;
    private BuiltInBrowserController browserController;

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
            Uri uri = Uri.parse("tel:" + number.trim());
            Intent intent = new Intent(Intent.ACTION_CALL, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to make phone call: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openDefaultPhone(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
    public void openSystemSetting(PluginCall call) {
        String setting = call.getString("setting", "settings");
        Intent intent;

        switch (setting) {
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
