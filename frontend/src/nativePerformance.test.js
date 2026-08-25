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

test("sound preferences do not require broad media or system-settings access", () => {
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

  expect(manifest).not.toContain("android.permission.WRITE_SETTINGS");
  expect(manifest).not.toContain("android.permission.READ_MEDIA_AUDIO");
  expect(manifest).not.toContain("android.permission.READ_EXTERNAL_STORAGE");
  expect(manifest).not.toContain("android.permission.WRITE_EXTERNAL_STORAGE");
  expect(plugin).not.toContain("setDefaultTone");
  expect(plugin).not.toContain("ACTION_MANAGE_WRITE_SETTINGS");
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
