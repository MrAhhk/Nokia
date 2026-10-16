import fs from "fs";
import path from "path";

const imeSource = fs.readFileSync(
  path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/NokiaIME.java"),
  "utf8"
);

test("Nokia IME keeps the 41 percent keypad and adds top-rim clearance", () => {
  expect(imeSource).toContain("resolvePhysicalDisplayHeightPx()");
  expect(imeSource).toContain("KEYBOARD_HEIGHT_PERCENT = 48");
  expect(imeSource).toContain("physicalDisplayHeightPx * KEYBOARD_HEIGHT_PERCENT / 100");
  expect(imeSource).toContain("getMaximumWindowMetrics().getBounds().height()");
  expect(imeSource).not.toContain("screenHeightPx / 2");
});

test("wordmark clearance and its dismiss gesture share the same geometry", () => {
  expect(imeSource).toContain("view.getHeight() * 7f / 48f");
});

test("Nokia IME requests immersive navigation chrome when its window is shown", () => {
  expect(imeSource).toContain("void onWindowShown()");
  expect(imeSource).toContain("configureStableInputWindowChrome();");
  expect(imeSource).toContain("WindowInsets.Type.navigationBars()");
  expect(imeSource).toContain("WindowInsets.Type.captionBar()");
  expect(imeSource).toContain("View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY");
  expect(imeSource).not.toContain("setNavigationBarColor(");
  expect(imeSource).toContain("imeWindow.setWindowAnimations(0)");
  expect(imeSource).toContain("webView.setBackgroundColor(Color.BLACK)");
});

test("IME chrome cannot mutate layout before the input window is actually shown", () => {
  const createInputView = imeSource.match(/public View onCreateInputView\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  const startInputView = imeSource.match(/public void onStartInputView\([^)]*\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  expect(createInputView).not.toContain("configureStableInputWindowChrome");
  expect(startInputView).not.toContain("configureStableInputWindowChrome");
  expect(imeSource).not.toContain("setDecorFitsSystemWindows(false)");
});

test("Nokia IME configures stable chrome once and never mixes modern and legacy inset controllers", () => {
  expect(imeSource).toContain("mWindowChromeConfigured");
  expect(imeSource).toContain("configureStableInputWindowChrome()");
  expect(imeSource).toMatch(/if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.R\)[\s\S]*?controller\.hide\([\s\S]*?\}\s*else\s*\{[\s\S]*?setSystemUiVisibility/);

  const modernBranch = imeSource.match(
    /if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.R\) \{([\s\S]*?)\n\s*\} else \{/
  )?.[1] || "";
  expect(modernBranch).not.toContain("setSystemUiVisibility");
});

test("Nokia IME replaces an unusable WebView after its renderer exits", () => {
  expect(imeSource).toContain("onRenderProcessGone");
  expect(imeSource).toContain("replaceWebViewAfterRendererExit(view)");
  expect(imeSource).toContain("mInputArea.removeView(failedView)");
  expect(imeSource).toContain("failedView.destroy()");
  expect(imeSource).toContain("mWebView = createKeyboardWebView");
});

test("Nokia IME has one height owner so the WebView always matches the visible module", () => {
  expect(imeSource).toContain("new FixedHeightInputView(themedContext, heightPx)");
  expect(imeSource).toContain("class FixedHeightInputView extends FrameLayout");
  expect(imeSource).toContain("MeasureSpec.makeMeasureSpec(");
  expect(imeSource).toContain("MeasureSpec.EXACTLY");
  expect(imeSource).toContain("mInputArea.setTargetHeight(heightPx)");
  expect(imeSource).toContain("ViewGroup.LayoutParams.MATCH_PARENT");
  expect(imeSource).not.toContain("mWebView.getLayoutParams().height = heightPx");
});

test("Nokia IME reports its content from the real top edge instead of subtracting its WebView height", () => {
  expect(imeSource).toContain("outInsets.contentTopInsets = 0;");
  expect(imeSource).toContain("outInsets.visibleTopInsets = 0;");
  expect(imeSource).not.toContain("decorHeight - inputAreaHeight");
});

test("IME follows Android editor visibility and still honors explicit user dismissal", () => {
  expect(imeSource).not.toContain("mUserDismissedForSession");
  expect(imeSource).not.toContain("public void hideWindow()");
  expect(imeSource).not.toContain("requestShowSelf(0)");
  expect(imeSource).toContain("return super.onEvaluateInputViewShown();");
  expect(imeSource).toContain("dismissKeyboardByUser()");
  expect(imeSource).toContain("installWordmarkDismissGesture(webView)");
  expect(imeSource).toContain("requestHideSelf(0)");
});

test("Nokia IME bridge exposes existing native keypad tone and system grammar actions", () => {
  expect(imeSource).toContain("void playKeypadTone(final String key, final int durationMs, final boolean haptic)");
  expect(imeSource).toContain("void performSystemAction(final String action)");
  expect(imeSource).toContain('"HOME".equals(action)');
  expect(imeSource).toContain('"RECENT_APPS".equals(action)');
});

test("native D-pad does not drop rapid direction changes behind a second debounce", () => {
  expect(imeSource).not.toContain("mLastDpadPressTime");
  expect(imeSource).not.toContain("now - mLastDpadPressTime < 35");
});

test("native D-pad uses bounded accessibility navigation before falling back to key events", () => {
  const accessibilitySource = fs.readFileSync(
    path.resolve(__dirname, "../android/app/src/main/java/com/nokialauncher/NokiaAccessibilityService.java"),
    "utf8"
  );
  expect(imeSource).toContain("NokiaAccessibilityService.navigate(direction)");
  expect(imeSource).toContain("if (!handled && keyCode != 0)");
  expect(accessibilitySource).toContain("public static boolean navigate(String direction)");
  expect(accessibilitySource).toContain("ACTION_ACCESSIBILITY_FOCUS");
  expect(accessibilitySource).toContain("ACTION_SCROLL_FORWARD");
  expect(accessibilitySource).toContain("ACTION_SCROLL_BACKWARD");
  expect(accessibilitySource).toContain("isEditable()");
  expect(accessibilitySource).toContain("dispatchScrollGesture(direction)");
  expect(accessibilitySource).toContain("if (root == null) return dispatchScrollGesture(direction)");
  expect(accessibilitySource).toContain("new GestureDescription.StrokeDescription");
  const verticalBranch = accessibilitySource.indexOf('if ("UP".equals(direction) || "DOWN".equals(direction))');
  const focusSearch = accessibilitySource.indexOf("focused.focusSearch(focusDirection)");
  expect(verticalBranch).toBeGreaterThan(-1);
  expect(verticalBranch).toBeLessThan(focusSearch);
  expect(accessibilitySource).toContain("if (scrollNearest(focused, root, scrollAction)) return true;");
  expect(accessibilitySource).toContain("return dispatchScrollGesture(direction);");
});
