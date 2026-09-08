import fs from "fs";
import path from "path";

test("the IME reuses one main-thread Handler across keystrokes", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/app/NokiaIME.java",
    ),
    "utf8",
  );
  expect(source).toContain("private final Handler mMainHandler");
  expect(source).toContain("mMainHandler.post(runnable)");
});

test("the IME publishes classified control-surface modes at lifecycle seams", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/app/NokiaIME.java",
    ),
    "utf8",
  );

  expect(source).toContain("EditorContextClassifier.classify");
  expect(source).toMatch(
    /onStartInputView\(EditorInfo attribute, boolean restarting\)[\s\S]*?ControlSurfaceCoordinator\.setMode\(classifyMode\(attribute\)\)/,
  );
  expect(source).toMatch(
    /onFinishInputView\(boolean finishingInput\)[\s\S]*?ControlSurfaceCoordinator\.setMode\(ControlSurfaceMode\.NAVIGATION\)/,
  );
});

test("the compact navigator uses one bounded accessibility overlay window", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/NokiaNavigatorOverlayController.java",
    ),
    "utf8",
  );

  expect(source).toContain("TYPE_ACCESSIBILITY_OVERLAY");
  expect(source).toContain("FLAG_NOT_FOCUSABLE");
  expect(source).not.toContain("TYPE_APPLICATION_OVERLAY");
  expect(source).not.toContain("SYSTEM_ALERT_WINDOW");
  expect(source).not.toContain("setInterval");
});

test("activity resume delegates WebView lifecycle without forcing redraws", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../android/app/src/main/java/com/nokialauncher/app/MainActivity.java",
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

test("launcher window draws edge-to-edge and hides both system bars", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/app/MainActivity.java"),
    "utf8",
  );

  expect(source).toContain("setDecorFitsSystemWindows(false)");
  expect(source).toContain("FLAG_FULLSCREEN");
  expect(source).toContain("WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()");
  expect(source).toContain("SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION");
  expect(source).toContain("setNavigationBarColor(Color.TRANSPARENT)");
  const cutoutStyle = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/res/values-v28/styles.xml"),
    "utf8",
  );
  expect(cutoutStyle).toContain("windowLayoutInDisplayCutoutMode");
  expect(cutoutStyle).toContain("shortEdges");
  expect(cutoutStyle).toContain("Theme.AppCompat.DayNight.NoActionBar");
  expect(cutoutStyle).toContain("windowActionBar");
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
      "../android/app/src/main/java/com/nokialauncher/app/browser/BuiltInBrowserController.java",
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
      "../android/app/src/main/java/com/nokialauncher/app/LauncherAppsPlugin.java",
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
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/app/LauncherAppsPlugin.java"),
    "utf8",
  );
  const ime = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/app/NokiaIME.java"),
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
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/app/LauncherAppsPlugin.java"),
    "utf8",
  );

  expect(plugin).toContain("toggleFlashlight");
  expect(plugin).toContain("CameraManager");
  expect(plugin).toContain("setTorchMode");
  expect(plugin).toContain("flashlightPermissionCallback");
});
