import fs from "fs";
import path from "path";

test("the IME reuses one main-thread Handler across keystrokes", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/NokiaIME.java",
    ),
    "utf8",
  );
  expect(source).toContain("private final Handler mMainHandler");
  expect(source).toContain("mMainHandler.post(runnable)");
});

test("activity resume delegates WebView lifecycle without forcing redraws", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/MainActivity.java",
    ),
    "utf8",
  );
  const onResume = source.match(/public void onResume\(\) \{([\s\S]*?)\n    \}/)?.[1];

  expect(onResume).toBeDefined();
  expect(onResume).not.toContain("resumeTimers()");
  expect(onResume).not.toContain("requestLayout()");
  expect(onResume).not.toContain("invalidate()");
  expect(onResume).not.toContain("getWebView().onResume()");
});

test("renderer recovery removes the dead WebView before terminal native recovery", () => {
  const mainActivitySource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/MainActivity.java",
    ),
    "utf8",
  );
  const handler = mainActivitySource.slice(
    mainActivitySource.indexOf("public boolean onRenderProcessGone"),
    mainActivitySource.indexOf("private void sanitizeIntent")
  );

  expect(handler).toContain("((ViewGroup) parent).removeView(view);");
  expect(handler).toContain("if (shellReadiness.rendererGone()) showNativeRecovery();");
  expect(handler.indexOf("view.destroy();")).toBeLessThan(handler.indexOf("shellReadiness.rendererGone()"));
  expect(handler).not.toContain("recreate();");
  expect(handler).not.toContain("runOnUiThread");
});

test("queued Home callbacks cannot touch a WebView after renderer recovery starts", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/MainActivity.java",
    ),
    "utf8",
  );
  const dispatchHome = source.slice(
    source.indexOf("private void dispatchHomeRequest"),
    source.indexOf("private void installRecoveringWebViewClient")
  );

  expect(dispatchHome).toContain("if (shellReadiness.isRecovery() || bridge == null || bridge.getWebView() == null) return;");
  expect(dispatchHome).toContain("if (shellReadiness.isRecovery() || bridge == null || bridge.getWebView() != webView) return;");
});

test("launcher window draws edge-to-edge and hides both system bars", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/MainActivity.java"),
    "utf8",
  );

  expect(source).toContain("WindowCompat.enableEdgeToEdge(getWindow())");
  expect(source).toContain("controller.hide(WindowInsetsCompat.Type.systemBars())");
  expect(source).toContain("BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE");
  expect(source).not.toContain("setStatusBarColor(");
  expect(source).not.toContain("setNavigationBarColor(");
  expect(source).toContain("webView.setBackgroundResource(R.drawable.launcher_window_background)");
  const cutoutStyle = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/res/values-v28/styles.xml"),
    "utf8",
  );
  expect(cutoutStyle).toContain("windowLayoutInDisplayCutoutMode");
  expect(cutoutStyle).toContain("shortEdges");
  expect(cutoutStyle).toContain("Theme.AppCompat.DayNight.NoActionBar");
  expect(cutoutStyle).toContain("windowActionBar");
});

test("launcher window keeps a non-black surface while WebView restores", () => {
  const style = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/res/values/styles.xml"),
    "utf8",
  );
  const background = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/res/drawable/launcher_window_background.xml"),
    "utf8",
  );
  expect(style).toContain("@drawable/launcher_window_background");
  expect(background).toContain("android:centerColor");
});

test("the Play launcher entry cannot create a second WebView Home task", () => {
  const manifest = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/AndroidManifest.xml"),
    "utf8",
  );

  const activities = manifest.match(/<activity\b[\s\S]*?<\/activity>/g) ?? [];
  const mainActivity = activities.find((activity) =>
    activity.includes('android:name=".MainActivity"'),
  );
  const launcherEntry = activities.find((activity) =>
    activity.includes('android:name=".LauncherEntryActivity"'),
  );

  expect(mainActivity).toContain("android.intent.category.HOME");
  expect(mainActivity).not.toContain("android.intent.category.LAUNCHER");
  expect(launcherEntry).toContain("android.intent.category.LAUNCHER");
});

test("the built-in browser never summons the system keyboard over the launcher keypad", () => {
  const browserController = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/browser/BuiltInBrowserController.java",
    ),
    "utf8",
  );

  expect(browserController).toContain("class LauncherBrowserWebView extends WebView");
  expect(browserController).toMatch(
    /onCreateInputConnection\(EditorInfo outAttrs\)[\s\S]*?return null;/,
  );
  expect(browserController).toMatch(
    /onCheckIsTextEditor\(\)[\s\S]*?return false;/,
  );
  expect(browserController).toContain("createLauncherInputConnection(new EditorInfo())");
  expect(browserController).toContain("inputmode");
  expect(browserController).toContain("MutationObserver");
});

test("system tone application uses one explicit special grant and no media permissions", () => {
  const manifest = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/AndroidManifest.xml"),
    "utf8",
  );
  const plugin = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/LauncherAppsPlugin.java",
    ),
    "utf8",
  );

  expect(manifest.match(/android\.permission\.WRITE_SETTINGS/g)).toHaveLength(1);
  expect(manifest).not.toContain("android.permission.READ_MEDIA_AUDIO");
  expect(manifest).not.toContain("android.permission.READ_EXTERNAL_STORAGE");
  expect(manifest).not.toContain("android.permission.WRITE_EXTERNAL_STORAGE");
  expect(plugin).toContain("getSystemToneAccess");
  expect(plugin).toContain("requestSystemToneAccess");
  expect(plugin).toContain("applySystemTone");
  expect(plugin).toContain("ACTION_MANAGE_WRITE_SETTINGS");
  expect(plugin).toContain("Settings.System.canWrite");
  expect(plugin).toContain("TYPE_NOTIFICATION");
  expect(plugin).toContain("DIRECTORY_NOTIFICATIONS");
  expect(plugin).not.toContain("DISPLAY_NAME + \"=?\"");
});

test("native haptics are bounded and classified as interaction feedback", () => {
  const plugin = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/LauncherAppsPlugin.java"),
    "utf8",
  );
  const ime = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/NokiaIME.java"),
    "utf8",
  );

  [plugin, ime].forEach((source) => {
    expect(source).toContain("USAGE_ASSISTANCE_SONIFICATION");
    expect(source).not.toContain("USAGE_ALARM");
    expect(source).toContain("Math.min(1000");
  });
});

test("flashlight action toggles the native camera torch", () => {
  const plugin = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/LauncherAppsPlugin.java"),
    "utf8",
  );

  expect(plugin).toContain("toggleFlashlight");
  expect(plugin).toContain("CameraManager");
  expect(plugin).toContain("setTorchMode");
  expect(plugin).toContain("flashlightPermissionCallback");
});
