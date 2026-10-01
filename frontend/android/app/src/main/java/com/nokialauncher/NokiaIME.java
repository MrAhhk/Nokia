package com.nokialauncher;

import android.annotation.TargetApi;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.inputmethodservice.InputMethodService;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.content.res.Configuration;
import android.view.ContextThemeWrapper;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import android.widget.FrameLayout;
import com.nokialauncher.R;

public class NokiaIME extends InputMethodService {
    private static final int KEYBOARD_HEIGHT_PERCENT = 48;


    public enum IMEState {
        ACTIVE,
        LAUNCHER_SUPPRESSED,
        HIDDEN_LANDSCAPE
    }

    private WebView mWebView;
    private FixedHeightInputView mInputArea;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());
    private boolean mWindowChromeConfigured;
    private IMEState mIMEState = IMEState.ACTIVE;
    private ToneGenerator mToneGenerator;

    private synchronized ToneGenerator getToneGenerator() {
        if (mToneGenerator == null) {
            try {
                mToneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);
            } catch (Exception ignored) {
                mToneGenerator = null;
            }
        }
        return mToneGenerator;
    }

    private synchronized void releaseToneGenerator() {
        if (mToneGenerator != null) {
            try {
                mToneGenerator.release();
            } catch (Exception ignored) {}
            mToneGenerator = null;
        }
    }

    private static int resolveKeypadTone(String key) {
        if (key == null) return -1;
        switch (key) {
            case "0": case "GREEN": case "CALL": case "SEND": case "END":
            case "RED": case "HOME": case "SOFT_LEFT": case "SOFT_RIGHT":
            case "GOTO": case "BACK": case "DELETE": case "UP": case "DOWN":
            case "LEFT": case "RIGHT": case "SELECT": case "TAB":
                return ToneGenerator.TONE_DTMF_0;
            case "1": return ToneGenerator.TONE_DTMF_1;
            case "2": return ToneGenerator.TONE_DTMF_2;
            case "3": return ToneGenerator.TONE_DTMF_3;
            case "4": return ToneGenerator.TONE_DTMF_4;
            case "5": return ToneGenerator.TONE_DTMF_5;
            case "6": return ToneGenerator.TONE_DTMF_6;
            case "7": return ToneGenerator.TONE_DTMF_7;
            case "8": return ToneGenerator.TONE_DTMF_8;
            case "9": return ToneGenerator.TONE_DTMF_9;
            case "*": case "STAR": return ToneGenerator.TONE_DTMF_S;
            case "#": case "HASH": return ToneGenerator.TONE_DTMF_P;
            default: return -1;
        }
    }

    private void triggerKeyHaptic(int durationMs) {
        try {
            android.os.Vibrator vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            int duration = Math.min(1000, Math.max(1, durationMs > 0 ? durationMs : 85));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.media.AudioAttributes attributes = new android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .build();
                vibrator.vibrate(android.os.VibrationEffect.createOneShot(duration, 160), attributes);
            } else {
                vibrator.vibrate(duration);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public View onCreateInputView() {
        // Wrap context with AppTheme to avoid WebView service context crash on modern Android
        ContextThemeWrapper themedContext = new ContextThemeWrapper(this, R.style.AppTheme_NoActionBar);
        
        // Preserve the 41% homescreen keypad and add one percent of clearance
        // above the wordmark so the closed top rim cannot overlap the logo.
        int physicalDisplayHeightPx = resolvePhysicalDisplayHeightPx();
        int heightPx = physicalDisplayHeightPx * KEYBOARD_HEIGHT_PERCENT / 100;

        mInputArea = new FixedHeightInputView(themedContext, heightPx);
        mInputArea.setBackgroundColor(Color.BLACK);
        mInputArea.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            heightPx
        ));

        if (mWebView != null) {
            if (mWebView.getParent() instanceof ViewGroup) {
                ((ViewGroup) mWebView.getParent()).removeView(mWebView);
            }
            mWebView.destroy();
        }
        mWebView = createKeyboardWebView(themedContext);
        mInputArea.addView(mWebView);
        return mInputArea;
    }

    private WebView createKeyboardWebView(Context context) {
        WebView webView = new WebView(context);
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        installWordmarkDismissGesture(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        
        // Critical: Enable local script file cross-origin loading for React split-chunk scripts
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Bridge interface to commit typing system-wide
        webView.addJavascriptInterface(new NokiaIMEBridge(), "NokiaIMEBridge");

        webView.setWebViewClient(new RecoveringKeyboardWebViewClient());

        webView.loadUrl("file:///android_asset/public/index.html?view=keyboard");
        return webView;
    }

    private final class RecoveringKeyboardWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return true; // The keyboard has no navigable destinations, including subframes.
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return interceptKeyboardResource(request.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return interceptKeyboardResource(url);
        }

        private WebResourceResponse interceptKeyboardResource(String url) {
            if (KeyboardResourcePolicy.allows(url)) return null;
            return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        }

        @TargetApi(Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            postToMainThread(() -> replaceWebViewAfterRendererExit(view));
            return true;
        }
    }

    private void replaceWebViewAfterRendererExit(WebView failedView) {
        if (failedView == null) return;
        if (mInputArea != null) mInputArea.removeView(failedView);
        failedView.destroy();
        if (failedView != mWebView || mInputArea == null) return;

        ContextThemeWrapper themedContext = new ContextThemeWrapper(
            this,
            R.style.AppTheme_NoActionBar
        );
        mWebView = createKeyboardWebView(themedContext);
        mInputArea.addView(mWebView);
    }

    private int resolvePhysicalDisplayHeightPx() {
        WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return windowManager.getMaximumWindowMetrics().getBounds().height();
        }
        if (windowManager != null) {
            DisplayMetrics realMetrics = new DisplayMetrics();
            windowManager.getDefaultDisplay().getRealMetrics(realMetrics);
            if (realMetrics.heightPixels > 0) return realMetrics.heightPixels;
        }
        return getResources().getDisplayMetrics().heightPixels;
    }

    /**
     * InputMethodService installs the view returned by onCreateInputView inside
     * a framework-owned WRAP_CONTENT container. Some vendor implementations
     * replace or constrain the returned view's LayoutParams, which previously
     * collapsed this keyboard to the 48 px navigation-bar strip even though
     * its child requested the lower hardware module height. Keep that height in the
     * view's measurement contract so it remains authoritative after attachment.
     */
    private static final class FixedHeightInputView extends FrameLayout {
        private int mTargetHeightPx;

        FixedHeightInputView(Context context, int targetHeightPx) {
            super(context);
            mTargetHeightPx = targetHeightPx;
            setMinimumHeight(targetHeightPx);
        }

        void setTargetHeight(int targetHeightPx) {
            if (mTargetHeightPx == targetHeightPx) return;
            mTargetHeightPx = targetHeightPx;
            setMinimumHeight(targetHeightPx);
            requestLayout();
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int exactHeightSpec = MeasureSpec.makeMeasureSpec(
                mTargetHeightPx,
                MeasureSpec.EXACTLY
            );
            super.onMeasure(widthMeasureSpec, exactHeightSpec);
        }
    }

    private void installWordmarkDismissGesture(WebView webView) {
        final float[] start = new float[2];
        final boolean[] tracking = new boolean[1];
        final int dismissDistance = Math.max(
            ViewConfiguration.get(this).getScaledTouchSlop() * 4,
            (int) (48 * getResources().getDisplayMetrics().density)
        );

        webView.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    // The expanded wordmark clearance is the top 7/48 of the module.
                    tracking[0] = event.getY() <= view.getHeight() * 7f / 48f;
                    start[0] = event.getX();
                    start[1] = event.getY();
                    break;
                case MotionEvent.ACTION_MOVE:
                case MotionEvent.ACTION_UP:
                    if (tracking[0]) {
                        float deltaX = Math.abs(event.getX() - start[0]);
                        float deltaY = event.getY() - start[1];
                        if (deltaY >= dismissDistance && deltaY > deltaX * 1.25f) {
                            tracking[0] = false;
                            dismissKeyboardByUser();
                        }
                    }
                    if (event.getActionMasked() == MotionEvent.ACTION_UP) tracking[0] = false;
                    break;
                case MotionEvent.ACTION_CANCEL:
                    tracking[0] = false;
                    break;
                default:
                    break;
            }
            return false;
        });
    }

    // Respect Android's editor-driven IME lifecycle. Nokia-specific suppression
    // remains for landscape and the launcher, but normal apps decide when an
    // active text editor needs the keyboard.
    @Override
    public boolean onEvaluateInputViewShown() {
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            return false;
        }
        if (mIMEState != IMEState.ACTIVE) {
            return false;
        }
        return super.onEvaluateInputViewShown();
    }

    // Prevent keyboard from taking up the entire screen in landscape mode
    @Override
    public boolean onEvaluateFullscreenMode() {
        return false;
    }

    private void dismissKeyboardByUser() {
        super.hideWindow();
        requestHideSelf(0);
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        
        // Hide keyboard in landscape orientation
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            mIMEState = IMEState.HIDDEN_LANDSCAPE;
            requestHideSelf(0);
            return;
        }

        // If the active target is our own Nokia Launcher, hide the system keyboard
        // to prevent rendering duplicate keypads on the Home screen.
        if (attribute != null && getPackageName().equals(attribute.packageName)) {
            mIMEState = IMEState.LAUNCHER_SUPPRESSED;
            requestHideSelf(0);
            return;
        }

        mIMEState = IMEState.ACTIVE;

        // Editor restart callbacks can happen while composing. Resetting here
        // used to cancel active multi-tap input and add a JS/main-thread hop.
        if (mWebView != null && InputSessionPolicy.shouldResetComposer(restarting, mIMEState)) {
            mWebView.evaluateJavascript("if(window.resetNokiaKeyboard) { window.resetNokiaKeyboard(); }", null);
        }
    }

    @Override
    public void onComputeInsets(InputMethodService.Insets outInsets) {
        super.onComputeInsets(outInsets);
        if (!isFullscreenMode()) {
            // These coordinates are relative to the IME window, not the full
            // display. The Nokia module begins at y=0 inside this window.
            // Subtracting the WebView height here left the window-decoration
            // strip unreported and allowed chat composers underneath it.
            outInsets.contentTopInsets = 0;
            outInsets.visibleTopInsets = 0;
            outInsets.touchableInsets = InputMethodService.Insets.TOUCHABLE_INSETS_VISIBLE;
        }
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        configureStableInputWindowChrome();
    }

    private void configureStableInputWindowChrome() {
        if (getWindow() == null || getWindow().getWindow() == null) {
            return;
        }

        Window imeWindow = getWindow().getWindow();
        View decorView = imeWindow.getDecorView();
        if (!mWindowChromeConfigured) {
            imeWindow.setWindowAnimations(0);
            imeWindow.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                imeWindow.setNavigationBarContrastEnforced(false);
            }
            mWindowChromeConfigured = true;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = imeWindow.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
                controller.hide(
                    WindowInsets.Type.navigationBars() | WindowInsets.Type.captionBar()
                );
            }
        } else {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }

    private void postToMainThread(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
        } else {
            mMainHandler.post(runnable);
        }
    }

    @Override
    public void onDestroy() {
        releaseToneGenerator();
        if (mWebView != null) {
            mWebView.destroy();
            mWebView = null;
        }
        super.onDestroy();
    }

    // JavaScript to Native Java communication bridge
    public class NokiaIMEBridge {

        @JavascriptInterface
        public void playKeypadTone(final String key, final int durationMs, final boolean haptic) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    if (haptic) triggerKeyHaptic(60);
                    int tone = resolveKeypadTone(key);
                    ToneGenerator generator = getToneGenerator();
                    if (tone >= 0 && generator != null) {
                        generator.startTone(tone, Math.min(1000, Math.max(1, durationMs)));
                    }
                }
            });
        }

        @JavascriptInterface
        public void performSystemAction(final String action) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    if ("HOME".equals(action)) {
                        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
                        homeIntent.addCategory(Intent.CATEGORY_HOME);
                        homeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(homeIntent);
                    } else if ("RECENT_APPS".equals(action)) {
                        NokiaAccessibilityService.openRecentApps();
                    } else if ("LOCK_SCREEN".equals(action)) {
                        NokiaAccessibilityService.lockScreen();
                    }
                }
            });
        }

        @JavascriptInterface
        public void commitText(final String text) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) {
                        ic.commitText(text, 1);
                        if ("\n".equals(text)) {
                            sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER);
                        }
                    } else if (text != null) {
                        if ("\n".equals(text)) {
                            sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER);
                        } else if (" ".equals(text)) {
                            sendDownUpKeyEvents(KeyEvent.KEYCODE_SPACE);
                        } else {
                            for (char c : text.toCharArray()) {
                                sendKeyChar(c);
                            }
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void setComposingText(final String text) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) {
                        ic.setComposingText(text, 1);
                    }
                }
            });
        }

        @JavascriptInterface
        public void deleteSurroundingText(final int before, final int after) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) {
                        ic.deleteSurroundingText(before, after);
                    } else {
                        sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL);
                    }
                }
            });
        }

        @JavascriptInterface
        public void sendDpadKey(final String direction) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    int keyCode = 0;
                    if ("UP".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_UP;
                    else if ("DOWN".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_DOWN;
                    else if ("LEFT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_LEFT;
                    else if ("RIGHT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_RIGHT;
                    else if ("SELECT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_CENTER;
                    else if ("BACK".equals(direction)) keyCode = KeyEvent.KEYCODE_BACK;

                    boolean handled = NokiaAccessibilityService.navigate(direction);
                    if (!handled && keyCode != 0) {
                        sendDownUpKeyEvents(keyCode);
                    }
                }
            });
        }

        @JavascriptInterface
        public void hideKeyboard() {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    dismissKeyboardByUser();
                }
            });
        }

        @JavascriptInterface
        public void setMinimized(final boolean minimized) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    if (mInputArea == null) return;
                    int physicalDisplayHeightPx = resolvePhysicalDisplayHeightPx();
                    int heightPx = minimized
                        ? (physicalDisplayHeightPx / 15)
                        : (physicalDisplayHeightPx * KEYBOARD_HEIGHT_PERCENT / 100);
                    mInputArea.setTargetHeight(heightPx);
                }
            });
        }

        @JavascriptInterface
        public void switchToGboard() {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        switchInputMethod("com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME");
                    } catch (Exception e) {
                        android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) 
                            getSystemService(Context.INPUT_METHOD_SERVICE);
                        if (imm != null) {
                            imm.showInputMethodPicker();
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void triggerHaptic(final int durationMs) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    triggerKeyHaptic(durationMs);
                }
            });
        }

        @JavascriptInterface
        public void triggerHapticPattern(final String patternJson) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        android.os.Vibrator v = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        if (v != null && v.hasVibrator()) {
                            org.json.JSONArray arr = new org.json.JSONArray(patternJson);
                            int patternLength = Math.min(arr.length(), 20);
                            long[] timings = new long[patternLength];
                            int[] amplitudes = new int[patternLength];
                            for (int i = 0; i < patternLength; i++) {
                                timings[i] = Math.min(1000L, Math.max(0L, arr.optLong(i, 0)));
                                amplitudes[i] = (i % 2 == 1) ? 160 : 0;
                            }
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                                android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                                    .build();
                                android.os.VibrationEffect effect = android.os.VibrationEffect.createWaveform(timings, amplitudes, -1);
                                v.vibrate(effect, audioAttributes);
                            } else {
                                v.vibrate(timings, -1);
                            }
                        }
                    } catch (Exception ignored) {}
                }
            });
        }
    }
}
