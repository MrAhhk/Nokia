import fs from "fs";
import path from "path";

const read = (file) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

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
