import fs from "fs";
import path from "path";

const read = (file) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

test("native recovery exposes only user-triggered system escapes without a new Home host", () => {
  const source = read("android/app/src/main/java/com/nokialauncher/billing/BillingRecoveryView.java");
  for (const action of ["Intent.ACTION_DIAL", "Settings.ACTION_HOME_SETTINGS", "Settings.ACTION_SETTINGS", "Settings.ACTION_INPUT_METHOD_SETTINGS"]) {
    expect(source).toContain(`new Intent(${action}`);
  }
  expect(source.match(/new Intent\(/g)).toHaveLength(4);
  expect(source).toContain("button.setOnClickListener");
  expect(source).toContain("activity.startActivity(intent)");
  expect(source).toContain("ActivityNotFoundException | SecurityException");
  expect(source).not.toMatch(/WebView|BillingRuntime|Purchases|FLAG_ACTIVITY_NEW_TASK|ACTION_CALL|clearApplicationUserData|recreate\(/);
});

test("MainActivity owns one boot deadline and a terminal renderer fallback", () => {
  const source = read("android/app/src/main/java/com/nokialauncher/MainActivity.java");
  expect(source.match(/postDelayed\(bootDeadline/g)).toHaveLength(1);
  expect(source).toContain("BuildConfig.BILLING_ROLLOUT_ENABLED");
  expect(source).toContain("bridge.getWebView() == source");
  expect(source).toContain("source.getUrl()");
  expect(source).toContain("shellHandler.removeCallbacks(bootDeadline)");
  expect(source).toContain("setContentView(recoveryView)");
  expect(source).toContain("view.destroy()");
  expect(source).toContain('bridge.getPlugin("LauncherApps")');
  expect(source).toContain("plugin.getInstance() instanceof LauncherAppsPlugin");
  expect(source).toContain(".enterNativeRecovery()");
  expect(source.indexOf(".enterNativeRecovery()")).toBeLessThan(source.indexOf("setContentView(recoveryView)"));
  expect(source).toContain("public boolean permitsPackagedShell(WebView source)");
  expect(source).toContain("shellReadiness.permits(");
  expect(source).not.toMatch(/recreate\(|new WebView|startActivity\(|finishAndRemoveTask/);
  const resume = source.match(/public void onResume\(\) \{([\s\S]*?)\n    \}/)?.[1];
  expect(resume).not.toMatch(/start\(|postDelayed/);
  expect(source).toContain("BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE");
});

// Source gates complement the Android cold-launch/fallback runtime checks.
test("launcher entry finishes itself without removing the newly opened Home task", () => {
  const source = read("android/app/src/main/java/com/nokialauncher/LauncherEntryActivity.java");
  expect(source).toContain("startActivity(homeIntent)");
  expect(source).not.toContain("finishAndRemoveTask(");
  expect(source).toContain("finish();");
  expect(source).toContain("Intent.CATEGORY_HOME");
  expect(source).toContain("homeIntent.setPackage(getPackageName())");
  expect(source).not.toContain("homeIntent.setClass(");
  expect(source).not.toContain("homeIntent.setComponent(");
  expect(source).toContain("Intent.FLAG_ACTIVITY_SINGLE_TOP");
});

test.each(["onSaveInstanceState", "onRestart", "onDetachedFromWindow"])(
  "Capacitor %s preserves Android lifecycle without dereferencing a failed WebView bridge", (method) => {
    const source = read("node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java");
    const body = source.match(new RegExp(`public void ${method}\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}`))?.[1];
    expect(body).toBeDefined();
    expect(body).toContain(`super.${method}(`);
    expect(body).toMatch(/if \((?:this\.)?bridge != null\)\s*\{/);
    expect(body.indexOf(`super.${method}(`)).toBeLessThan(body.indexOf("!= null"));
  },
);
