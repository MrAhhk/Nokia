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
  expect(browserController).toContain("createLauncherInputConnection(new EditorInfo())");
});
