package com.nokialauncher;

import android.content.Context;
import android.graphics.Color;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.content.res.Configuration;
import android.view.ContextThemeWrapper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.nokialauncher.R;

public class NokiaIME extends InputMethodService {

    public enum IMEState {
        ACTIVE,
        LAUNCHER_SUPPRESSED,
        HIDDEN_LANDSCAPE
    }

    private WebView mWebView;
    private FrameLayout mInputArea;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());
    private boolean mForceVisible = true;
    private IMEState mIMEState = IMEState.ACTIVE;

    @Override
    public View onCreateInputView() {
        // Wrap context with AppTheme to avoid WebView service context crash on modern Android
        ContextThemeWrapper themedContext = new ContextThemeWrapper(this, R.style.AppTheme_NoActionBar);
        
        // Calculate exactly 50% of display height to match homescreen dvh layout
        DisplayMetrics displayMetrics = getResources().getDisplayMetrics();
        int screenHeightPx = displayMetrics.heightPixels;
        int heightPx = screenHeightPx / 2;

        mInputArea = new FrameLayout(themedContext);
        mInputArea.setBackgroundColor(Color.BLACK);
        mInputArea.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            heightPx
        ));

        mWebView = new WebView(themedContext);
        mWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            heightPx
        ));

        // Configure WebView settings
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        
        // Critical: Enable local script file cross-origin loading for React split-chunk scripts
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Bridge interface to commit typing system-wide
        mWebView.addJavascriptInterface(new NokiaIMEBridge(), "NokiaIMEBridge");

        // Force opening local links inside WebView
        mWebView.setWebViewClient(new WebViewClient());

        // Load the local React application with keyboard query parameter
        mWebView.loadUrl("file:///android_asset/public/index.html?view=keyboard");

        mInputArea.addView(mWebView);
        return mInputArea;
    }

    // Show the keyboard input view to achieve "permanent" keyboard behavior, but hide on landscape or launcher
    @Override
    public boolean onEvaluateInputViewShown() {
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            return false;
        }
        if (mIMEState == IMEState.LAUNCHER_SUPPRESSED) {
            return false;
        }
        return mForceVisible;
    }

    // Prevent keyboard from taking up the entire screen in landscape mode
    @Override
    public boolean onEvaluateFullscreenMode() {
        return false;
    }

    // Overriding hideWindow to block system hiding unless explicitly triggered by JS bridge or Launcher suppression
    @Override
    public void hideWindow() {
        if (mIMEState == IMEState.LAUNCHER_SUPPRESSED) {
            super.hideWindow();
            return;
        }
        if (mForceVisible) {
            // Keep the keyboard window visible!
            return;
        }
        super.hideWindow();
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        
        // Hide keyboard in landscape orientation
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            mIMEState = IMEState.HIDDEN_LANDSCAPE;
            mForceVisible = false;
            requestHideSelf(0);
            return;
        }

        // If the active target is our own Nokia Launcher, hide the system keyboard
        // to prevent rendering duplicate keypads on the Home screen.
        if (attribute != null && getPackageName().equals(attribute.packageName)) {
            mIMEState = IMEState.LAUNCHER_SUPPRESSED;
            mForceVisible = false;
            requestHideSelf(0);
            return;
        }

        mIMEState = IMEState.ACTIVE;
        mForceVisible = true; // Reset force-visibility when a new input session starts

        // Only request showing the soft keyboard on fresh app/window switches.
        // Skipping on restarting (typing/selection changes) completely prevents lag.
        if (InputSessionPolicy.shouldRequestShow(restarting, mIMEState)) {
            requestShowSelf(0);
        }

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
            int fallback = outInsets.visibleTopInsets;
            int inputHeight = mInputArea != null ? mInputArea.getHeight() : 0;
            View decor = (getWindow() != null && getWindow().getWindow() != null)
                ? getWindow().getWindow().getDecorView()
                : null;
            int decorHeight = (decor != null && decor.getHeight() > 0)
                ? decor.getHeight()
                : getResources().getDisplayMetrics().heightPixels;

            int top = InputSessionPolicy.computeTopInsets(decorHeight, inputHeight, fallback);
            outInsets.contentTopInsets = top;
            outInsets.visibleTopInsets = top;
            outInsets.touchableInsets = InputMethodService.Insets.TOUCHABLE_INSETS_VISIBLE;
        }
    }

    @Override
    public void onStartInputView(EditorInfo attribute, boolean restarting) {
        super.onStartInputView(attribute, restarting);
    }

    private void postToMainThread(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
        } else {
            mMainHandler.post(runnable);
        }
    }

    // JavaScript to Native Java communication bridge
    public class NokiaIMEBridge {

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

        private long mLastDpadPressTime = 0;

        @JavascriptInterface
        public void sendDpadKey(final String direction) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    long now = System.currentTimeMillis();
                    if (now - mLastDpadPressTime < 35) {
                        return;
                    }
                    mLastDpadPressTime = now;

                    int keyCode = 0;
                    if ("UP".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_UP;
                    else if ("DOWN".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_DOWN;
                    else if ("LEFT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_LEFT;
                    else if ("RIGHT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_RIGHT;
                    else if ("SELECT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_CENTER;
                    else if ("BACK".equals(direction)) keyCode = KeyEvent.KEYCODE_BACK;

                    if (keyCode != 0) {
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
                    mForceVisible = false;
                    requestHideSelf(0);
                }
            });
        }

        @JavascriptInterface
        public void setMinimized(final boolean minimized) {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    DisplayMetrics dm = getResources().getDisplayMetrics();
                    int heightPx = minimized ? (dm.heightPixels / 15) : (dm.heightPixels / 2);
                    mInputArea.getLayoutParams().height = heightPx;
                    if (mWebView.getLayoutParams() != null) {
                        mWebView.getLayoutParams().height = heightPx;
                    }
                    mInputArea.requestLayout();
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
                    try {
                        android.os.Vibrator v = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        if (v != null && v.hasVibrator()) {
                            int d = Math.min(1000, Math.max(1, durationMs > 0 ? durationMs : 85));
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                                android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                                    .build();
                                v.vibrate(android.os.VibrationEffect.createOneShot(d, 160), audioAttributes);
                            } else {
                                v.vibrate(d);
                            }
                        }
                    } catch (Exception ignored) {}
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
