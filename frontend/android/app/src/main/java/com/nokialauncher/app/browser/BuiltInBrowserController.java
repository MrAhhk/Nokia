package com.nokialauncher.app.browser;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** Owns the isolated native WebView surface used by the launcher browser. */
public final class BuiltInBrowserController {
    private static final String START_URL = "https://www.google.com";
    private static final int OLIVE = Color.rgb(223, 227, 193);
    private static final int OLIVE_DARK = Color.rgb(157, 168, 77);
    private static final int INK = Color.rgb(17, 24, 3);
    private static final int PAGE = Color.rgb(248, 248, 242);

    public interface BrowserStateListener {
        void onState(String event, String url, String title, int progress);
    }

    private final Activity activity;
    private final BrowserStateListener stateListener;
    private FrameLayout browserContainer;
    private WebView webView;
    private EditText addressField;
    private ProgressBar progressBar;
    private boolean active;
    private int surfaceX;
    private int surfaceY;
    private int surfaceWidth;
    private int surfaceHeight;

    public BuiltInBrowserController(Activity activity, BrowserStateListener stateListener) {
        this.activity = activity;
        this.stateListener = stateListener;
    }

    public void startBrowser(PluginCall call) {
        updateBounds(call);
        String requestedUrl = normalizeHttpUrl(call.getString("url", START_URL));
        if (requestedUrl == null) {
            call.reject("Only http and https URLs are supported");
            return;
        }
        activity.runOnUiThread(() -> {
            active = true;
            ensureBrowserView();
            attachToRoot();
            webView.onResume();
            if (!requestedUrl.equals(webView.getUrl())) webView.loadUrl(requestedUrl);
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("native", true);
            result.put("url", requestedUrl);
            call.resolve(result);
            emitState("started");
        });
    }

    public void navigate(PluginCall call) {
        String requestedUrl = normalizeHttpUrl(call.getString("url"));
        if (requestedUrl == null) {
            call.reject("Only http and https URLs are supported");
            return;
        }
        activity.runOnUiThread(() -> {
            if (webView == null) {
                call.reject("browser_not_started");
                return;
            }
            webView.loadUrl(requestedUrl);
            JSObject result = new JSObject();
            result.put("url", requestedUrl);
            call.resolve(result);
        });
    }

    public void control(PluginCall call) {
        String command = call.getString("command", "");
        activity.runOnUiThread(() -> {
            if (webView == null) {
                call.reject("browser_not_started");
                return;
            }
            boolean handled = true;
            switch (command) {
                case "back":
                    if (webView.canGoBack()) webView.goBack();
                    else handled = false;
                    break;
                case "forward":
                    if (webView.canGoForward()) webView.goForward();
                    else handled = false;
                    break;
                case "reload":
                    webView.reload();
                    break;
                case "scroll-up":
                    webView.pageUp(false);
                    break;
                case "scroll-down":
                    webView.pageDown(false);
                    break;
                case "focus-address":
                    focusAddressField();
                    break;
                case "open-external":
                    openExternally();
                    break;
                default:
                    handled = false;
            }
            JSObject result = new JSObject();
            result.put("handled", handled);
            result.put("command", command);
            call.resolve(result);
        });
    }

    public void updateSurfaceBounds(PluginCall call) {
        updateBounds(call);
        activity.runOnUiThread(() -> {
            if (browserContainer != null) applyBounds();
            JSObject result = new JSObject();
            result.put("updated", browserContainer != null);
            call.resolve(result);
        });
    }

    public void stopBrowser(PluginCall call) {
        activity.runOnUiThread(() -> {
            stop();
            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        });
    }

    public void pauseForBackground() {
        activity.runOnUiThread(() -> {
            if (!active || webView == null) return;
            webView.onPause();
            detachFromRoot();
        });
    }

    public void resumeFromBackground() {
        activity.runOnUiThread(() -> {
            if (!active || browserContainer == null || webView == null) return;
            attachToRoot();
            webView.onResume();
        });
    }

    public void stop() {
        active = false;
        hideKeyboard();
        detachFromRoot();
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearHistory();
            webView.removeAllViews();
            webView.destroy();
        }
        webView = null;
        addressField = null;
        progressBar = null;
        browserContainer = null;
    }

    public void destroy() {
        activity.runOnUiThread(this::stop);
    }

    private void ensureBrowserView() {
        if (browserContainer != null && webView != null) return;

        browserContainer = new FrameLayout(activity);
        GradientDrawable shell = roundedDrawable(OLIVE_DARK, dp(9), 0, Color.TRANSPARENT);
        browserContainer.setBackground(shell);
        browserContainer.setClipToOutline(true);

        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        browserContainer.addView(column, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        column.addView(createTopBar(), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpInt(46)
        ));

        progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(OLIVE_DARK));
        progressBar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(OLIVE));
        column.addView(progressBar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpInt(2)
        ));

        webView = new WebView(activity);
        configureWebView(webView);
        column.addView(webView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        column.addView(createBottomBar(), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpInt(40)
        ));
    }

    private View createTopBar() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dpInt(6), dpInt(5), dpInt(6), dpInt(5));
        bar.setBackgroundColor(OLIVE);

        TextView back = controlButton("‹", "Back");
        back.setOnClickListener(view -> {
            if (webView != null && webView.canGoBack()) webView.goBack();
        });
        bar.addView(back, new LinearLayout.LayoutParams(dpInt(38), ViewGroup.LayoutParams.MATCH_PARENT));

        addressField = new EditText(activity);
        addressField.setSingleLine(true);
        addressField.setTextSize(14);
        addressField.setTextColor(INK);
        addressField.setHintTextColor(Color.rgb(92, 98, 73));
        addressField.setHint("Search or enter address");
        addressField.setPadding(dpInt(12), 0, dpInt(10), 0);
        addressField.setSelectAllOnFocus(true);
        addressField.setImeOptions(EditorInfo.IME_ACTION_GO);
        addressField.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        addressField.setBackground(roundedDrawable(Color.rgb(244, 245, 229), dp(17), dpInt(1), Color.rgb(113, 121, 83)));
        addressField.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER)) {
                navigateFromAddress();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams addressParams = new LinearLayout.LayoutParams(0, dpInt(34), 1f);
        addressParams.setMargins(dpInt(2), 0, dpInt(5), 0);
        bar.addView(addressField, addressParams);

        TextView menu = controlButton("⋮", "Browser menu");
        menu.setOnClickListener(this::showBrowserMenu);
        bar.addView(menu, new LinearLayout.LayoutParams(dpInt(38), ViewGroup.LayoutParams.MATCH_PARENT));
        return bar;
    }

    private View createBottomBar() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER);
        bar.setBackgroundColor(OLIVE);

        TextView forward = controlButton("›", "Forward");
        forward.setOnClickListener(view -> {
            if (webView != null && webView.canGoForward()) webView.goForward();
        });
        bar.addView(forward, weightedControlParams());

        TextView reload = controlButton("↻", "Reload");
        reload.setOnClickListener(view -> {
            if (webView != null) webView.reload();
        });
        bar.addView(reload, weightedControlParams());

        TextView address = controlButton("⌕", "Focus address");
        address.setOnClickListener(view -> focusAddressField());
        bar.addView(address, weightedControlParams());

        TextView external = controlButton("↗", "Open externally");
        external.setOnClickListener(view -> openExternally());
        bar.addView(external, weightedControlParams());
        return bar;
    }

    private LinearLayout.LayoutParams weightedControlParams() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
    }

    private TextView controlButton(String glyph, String description) {
        TextView button = new TextView(activity);
        button.setText(glyph);
        button.setTextColor(INK);
        button.setTextSize(26);
        button.setGravity(Gravity.CENTER);
        button.setContentDescription(description);
        button.setClickable(true);
        button.setFocusable(true);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    private void configureWebView(WebView target) {
        target.setBackgroundColor(PAGE);
        target.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        target.setVerticalScrollBarEnabled(true);
        target.setHorizontalScrollBarEnabled(false);

        WebSettings settings = target.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(target, false);
        }

        target.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleRequestedUrl(view, request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleRequestedUrl(view, Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                setDisplayedAddress(url);
                emitState("loading");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                setDisplayedAddress(url);
                emitState("ready");
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                Toast.makeText(activity, "Secure connection failed", Toast.LENGTH_SHORT).show();
                emitState("ssl-error");
            }
        });

        target.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                if (progressBar != null) {
                    progressBar.setProgress(progress);
                    progressBar.setVisibility(progress >= 100 ? View.INVISIBLE : View.VISIBLE);
                }
                emitState(progress >= 100 ? "ready" : "loading");
            }
        });
    }

    private boolean handleRequestedUrl(WebView view, Uri uri) {
        String normalized = normalizeHttpUrl(uri == null ? null : uri.toString());
        if (normalized == null) {
            Toast.makeText(activity, "This link is not supported", Toast.LENGTH_SHORT).show();
            return true;
        }
        return false;
    }

    private void navigateFromAddress() {
        if (addressField == null || webView == null) return;
        String input = addressField.getText().toString().trim();
        String url = resolveAddressInput(input);
        if (url == null) {
            Toast.makeText(activity, "This address is not supported", Toast.LENGTH_SHORT).show();
            return;
        }
        hideKeyboard();
        addressField.clearFocus();
        webView.requestFocus();
        webView.loadUrl(url);
    }

    private String resolveAddressInput(String input) {
        if (input == null || input.trim().isEmpty()) return START_URL;
        String value = input.trim();
        String lower = value.toLowerCase(java.util.Locale.US);
        if (lower.startsWith("javascript:") || lower.startsWith("file:") || lower.startsWith("content:")
            || lower.startsWith("data:") || lower.startsWith("intent:")) return null;
        String direct = normalizeHttpUrl(value);
        if (direct != null) return direct;
        if (!value.contains(" ") && (value.contains(".") || "localhost".equalsIgnoreCase(value))) {
            return "https://" + value;
        }
        return "https://www.google.com/search?q=" + Uri.encode(value);
    }

    private String normalizeHttpUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return null;
        Uri uri = Uri.parse(rawUrl.trim());
        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return null;
        return uri.toString();
    }

    private void setDisplayedAddress(String url) {
        if (addressField == null || addressField.hasFocus() || url == null || "about:blank".equals(url)) return;
        addressField.setText(url);
    }

    private void focusAddressField() {
        if (addressField == null) return;
        addressField.requestFocus();
        addressField.selectAll();
        InputMethodManager input = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (input != null) input.showSoftInput(addressField, InputMethodManager.SHOW_IMPLICIT);
    }

    private void hideKeyboard() {
        InputMethodManager input = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        View focus = activity.getCurrentFocus();
        if (input != null && focus != null) input.hideSoftInputFromWindow(focus.getWindowToken(), 0);
    }

    private void showBrowserMenu(View anchor) {
        PopupMenu popup = new PopupMenu(activity, anchor);
        popup.getMenu().add("Open in browser");
        popup.getMenu().add("Clear session");
        popup.getMenu().add("Close");
        popup.setOnMenuItemClickListener(item -> {
            String title = String.valueOf(item.getTitle());
            if ("Open in browser".equals(title)) {
                openExternally();
            } else if ("Clear session".equals(title)) {
                CookieManager.getInstance().removeSessionCookies(null);
                WebStorage.getInstance().deleteAllData();
                if (webView != null) {
                    webView.clearHistory();
                    webView.loadUrl(START_URL);
                }
            } else if ("Close".equals(title)) {
                stop();
                emitState("closed");
            }
            return true;
        });
        popup.show();
    }

    private void openExternally() {
        if (webView == null) return;
        String url = normalizeHttpUrl(webView.getUrl());
        if (url == null) return;
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Toast.makeText(activity, "No browser can open this page", Toast.LENGTH_SHORT).show();
        }
    }

    private void emitState(String event) {
        if (stateListener == null) return;
        String url = webView == null || webView.getUrl() == null ? "" : webView.getUrl();
        String title = webView == null || webView.getTitle() == null ? "" : webView.getTitle();
        int progress = webView == null ? 0 : webView.getProgress();
        stateListener.onState(event, url, title, progress);
    }

    private void updateBounds(PluginCall call) {
        surfaceX = Math.max(0, call.getInt("x", 0));
        surfaceY = Math.max(0, call.getInt("y", 0));
        surfaceWidth = Math.max(1, call.getInt("width", activity.getResources().getDisplayMetrics().widthPixels));
        surfaceHeight = Math.max(1, call.getInt("height", activity.getResources().getDisplayMetrics().heightPixels / 2));
    }

    private void attachToRoot() {
        if (browserContainer == null) return;
        FrameLayout root = activity.findViewById(android.R.id.content);
        if (browserContainer.getParent() instanceof ViewGroup) {
            ((ViewGroup) browserContainer.getParent()).removeView(browserContainer);
        }
        root.addView(browserContainer);
        applyBounds();
        browserContainer.bringToFront();
    }

    private void applyBounds() {
        if (browserContainer == null) return;
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(surfaceWidth, surfaceHeight);
        params.leftMargin = surfaceX;
        params.topMargin = surfaceY;
        browserContainer.setLayoutParams(params);
    }

    private void detachFromRoot() {
        if (browserContainer != null && browserContainer.getParent() instanceof ViewGroup) {
            ((ViewGroup) browserContainer.getParent()).removeView(browserContainer);
        }
    }

    private GradientDrawable roundedDrawable(int color, float radius, int strokeWidth, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        if (strokeWidth > 0) drawable.setStroke(strokeWidth, strokeColor);
        return drawable;
    }

    private int dpInt(float value) {
        return Math.round(dp(value));
    }

    private float dp(float value) {
        return value * activity.getResources().getDisplayMetrics().density;
    }
}
