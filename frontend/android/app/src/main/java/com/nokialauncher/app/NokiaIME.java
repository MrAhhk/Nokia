package com.nokialauncher.app;

import android.content.Context;
import android.graphics.Color;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
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
import com.nokialauncher.app.R;

public class NokiaIME extends InputMethodService {

    private WebView mWebView;
    private FrameLayout mInputArea;
    private boolean mForceVisible = true;

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

    // Unconditionally show the keyboard input view to achieve "permanent" keyboard behavior
    @Override
    public boolean onEvaluateInputViewShown() {
        return true;
    }

    // Prevent keyboard from taking up the entire screen in landscape mode
    @Override
    public boolean onEvaluateFullscreenMode() {
        return false;
    }

    // Overriding hideWindow to block system hiding unless explicitly triggered by JS bridge
    @Override
    public void hideWindow() {
        if (mForceVisible) {
            // Keep the keyboard window visible!
            return;
        }
        super.hideWindow();
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        mForceVisible = true; // Reset force-visibility when a new input session starts
        
        // If the active target is our own Nokia Launcher, hide the system keyboard
        // to prevent rendering duplicate keypads on the Home screen.
        if (attribute != null && "com.nokialauncher.app".equals(attribute.packageName)) {
            mForceVisible = false;
            requestHideSelf(0);
            mForceVisible = true;
            return;
        }

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
            // Restore contentTopInsets to visibleTopInsets to correctly signal
            // the top boundary of the keyboard to force resizing instead of fullscreen/panning.
            outInsets.contentTopInsets = outInsets.visibleTopInsets;
        }
    }

    @Override
    public void onStartInputView(EditorInfo attribute, boolean restarting) {
        super.onStartInputView(attribute, restarting);
        requestShowSelf(0);
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
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) {
                        int keyCode = 0;
                        if ("UP".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_UP;
                        else if ("DOWN".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_DOWN;
                        else if ("LEFT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_LEFT;
                        else if ("RIGHT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_RIGHT;
                        else if ("SELECT".equals(direction)) keyCode = KeyEvent.KEYCODE_DPAD_CENTER;
                        else if ("BACK".equals(direction)) keyCode = KeyEvent.KEYCODE_BACK;

                        if (keyCode != 0) {
                            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
                            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
                        }
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
    }
}
