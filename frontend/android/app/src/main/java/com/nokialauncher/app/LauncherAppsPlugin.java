package com.nokialauncher;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Settings;
import android.view.inputmethod.InputMethodManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.text.Collator;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;

@CapacitorPlugin(name = "LauncherApps")
public class LauncherAppsPlugin extends Plugin {

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

        try {
            Uri uri = Uri.parse("tel:" + number.trim());
            Intent intent = new Intent(Intent.ACTION_DIAL, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to make phone call: " + e.getMessage(), e);
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
