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
        if (!restarting) {
            requestShowSelf(0);
        }

        // Reset any temporary state in WebView when starting a new typing session
        if (mWebView != null) {
            mWebView.evaluateJavascript("if(window.resetNokiaKeyboard) { window.resetNokiaKeyboard(); }", null);
        }
    }

    @Override
    public void onComputeInsets(InputMethodService.Insets outInsets) {
        super.onComputeInsets(outInsets);
        if (!isFullscreenMode()) {
            // Force contentTopInsets and visibleTopInsets to 0 (top of the IME window)
            // to ensure the system sends the full keyboard height bottom layout inset to target apps.
            outInsets.contentTopInsets = 0;
            outInsets.visibleTopInsets = 0;
        }
    }

    @Override
    public void onStartInputView(EditorInfo attribute, boolean restarting) {
        super.onStartInputView(attribute, restarting);
        if (mIMEState != IMEState.LAUNCHER_SUPPRESSED) {
            requestShowSelf(0);
        }
    }

    private void postToMainThread(Runnable runnable) {
        new Handler(Looper.getMainLooper()).post(runnable);
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
    }
}
