import fs from "fs";
import path from "path";
import { getReadMap, isConversationUnread } from "./lib/smsReadStatus";

const native = (file) => fs.readFileSync(path.resolve(__dirname,
  "../android/app/src/main/java/com/nokialauncher", file), "utf8");

// These facade operations must remain exported even when another feature edits the bridge.
test.each(["getRecentCalls", "deleteRecentCall", "markConversationRead", "getNotificationConversations",
  "replyNotificationMessage", "deleteConversation", "deleteMessage", "sendSms"])(
  "the native bridge still exports %s", (method) => {
    expect(native("LauncherAppsPlugin.java")).toMatch(new RegExp(
      `@PluginMethod\\s+public void ${method}\\(PluginCall call\\)`));
  });

test.each(["null", "[]", "42", '"broken"'])("invalid persisted read map %s cannot break inbox", (raw) => {
  localStorage.setItem("nokia_read_conversations_v1", raw);
  const map = getReadMap();
  expect(map).toEqual({});
  expect(isConversationUnread({ address: "123", unread: true }, map)).toBe(true);
});

test("the keyboard bridge host blocks network and content-provider resources", () => {
  const source = native("NokiaIME.java");
  expect(source).toContain("setBlockNetworkLoads(true)");
  expect(source).toContain("setAllowContentAccess(false)");
  expect(source).toContain("setAllowUniversalAccessFromFileURLs(false)");
  expect(source).toContain("shouldInterceptRequest");
  expect(source).toContain("shouldOverrideUrlLoading");
});

test("every browser tab handles renderer loss instead of crashing the launcher", () => {
  const source = native("browser/BuiltInBrowserController.java");
  expect(source).toContain("public boolean onRenderProcessGone");
  expect(source).toContain("tabs.remove(view)");
});

test("gallery decodes sampled photos and does not decode full images on the UI thread", () => {
  const source = native("camera/BuiltInCameraController.java");
  expect(source).toContain("inJustDecodeBounds = true");
  expect(source).toContain("inSampleSize =");
  expect(source).not.toContain("image.setImageURI(uri)");
  expect(source).not.toContain("BitmapFactory.decodeStream(stream);");
});
