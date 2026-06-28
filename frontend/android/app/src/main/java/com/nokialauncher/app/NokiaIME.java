package com.nokialauncher.app;

import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class NokiaIME extends InputMethodService {

    private WebView mWebView;

    @Override
    public View onCreateInputView() {
        // Create WebView programmatically
        mWebView = new WebView(this);
        
        // Match parent width, and specify height matching classic keypad size (350dp)
        int heightDp = 350;
        int heightPx = (int) (heightDp * getResources().getDisplayMetrics().density);
        
        ViewGroup.LayoutParams params = new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            heightPx
        );
        mWebView.setLayoutParams(params);

        // Configure WebView settings
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Bridge interface to commit typing system-wide
        mWebView.addJavascriptInterface(new NokiaIMEBridge(), "NokiaIMEBridge");

        // Force opening local links inside webview
        mWebView.setWebViewClient(new WebViewClient());

        // Load the local React application with keyboard query parameter
        mWebView.loadUrl("file:///android_asset/public/index.html?view=keyboard");

        return mWebView;
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        // Reset any temporary state in WebView when starting a new typing session
        if (mWebView != null) {
            mWebView.evaluateJavascript("if(window.resetNokiaKeyboard) { window.resetNokiaKeyboard(); }", null);
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
        public void hideKeyboard() {
            postToMainThread(new Runnable() {
                @Override
                public void run() {
                    requestHideSelf(0);
                }
            });
        }
    }
}
