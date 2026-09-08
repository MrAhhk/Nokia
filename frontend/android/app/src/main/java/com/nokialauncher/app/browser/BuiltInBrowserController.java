package com.nokialauncher.app.browser;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.text.Editable;
import android.view.Gravity;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.InputConnection;
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
import java.util.ArrayList;
import java.util.List;

/** Owns the isolated native WebView surface used by the launcher browser. */
public final class BuiltInBrowserController {
    private static final String START_URL = "https://www.google.com";
    private static final int MAX_TABS = 4;
    private static final int OLIVE = Color.rgb(157, 168, 77);
    private static final int INK = Color.rgb(17, 24, 3);
    private static final int PAGE = Color.rgb(248, 248, 242);
    private static final int CHROME = Color.rgb(240, 241, 235);
    private static final int CHROME_LINE = Color.rgb(192, 196, 184);
    private static final String DISABLE_SYSTEM_IME_SCRIPT =
        "(function(){"
            + "const selector='input,textarea,[contenteditable=\"true\"]';"
            + "const mark=root=>{if(root.matches&&root.matches(selector))root.setAttribute('inputmode','none');"
            + "if(root.querySelectorAll)root.querySelectorAll(selector).forEach(el=>el.setAttribute('inputmode','none'));};"
            + "mark(document);"
            + "if(!window.__nokiaImeObserver){window.__nokiaImeObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)mark(node);})));"
            + "window.__nokiaImeObserver.observe(document.documentElement,{childList:true,subtree:true});}"
            + "})();";

    public interface BrowserStateListener {
        void onState(String event, String url, String title, int progress);
    }

    private static final class LauncherBrowserWebView extends WebView {
        LauncherBrowserWebView(Context context) {
            super(context);
        }

        @Override
        public boolean onCheckIsTextEditor() {
            return false;
        }

        @Override
        public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
            return null;
        }

        InputConnection createLauncherInputConnection(EditorInfo outAttrs) {
            return super.onCreateInputConnection(outAttrs);
        }
    }

    private final Activity activity;
    private final BrowserStateListener stateListener;
    private FrameLayout browserContainer;
    private LinearLayout browserSurface;
    private FrameLayout webHost;
    private LinearLayout chromeBar;
    private WebView webView;
    private final List<WebView> tabs = new ArrayList<>();
    private int activeTabIndex = -1;
    private EditText addressField;
    private TextView tabCountButton;
    private TextView chromeDivider;
    private ProgressBar progressBar;
    private boolean addressPreviewActive;
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
            boolean createdTab = webView == null;
            if (createdTab) createTab(requestedUrl, true);
            for (WebView tab : tabs) tab.onResume();
            if (!createdTab && (webView.getUrl() == null || "about:blank".equals(webView.getUrl()))) {
                webView.loadUrl(requestedUrl);
            }
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
                case "input-preview":
                    handled = replaceInputPreview(call.getString("text", ""));
                    break;
                case "input-commit":
                    addressPreviewActive = false;
                    break;
                case "input-cancel-preview":
                    handled = cancelInputPreview();
                    break;
                case "input-text":
                    commitInputText(call.getString("text", ""));
                    break;
                case "backspace":
                    handled = deleteInputText();
                    break;
                case "submit":
                    submitFocusedInput();
                    break;
                case "tabs":
                    showTabsMenu(tabCountButton);
                    break;
                case "tab-next":
                    handled = switchRelativeTab(1);
                    break;
                case "tab-previous":
                    handled = switchRelativeTab(-1);
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
            for (WebView tab : tabs) tab.onPause();
            detachFromRoot();
        });
    }

    public void resumeFromBackground() {
        activity.runOnUiThread(() -> {
            if (!active || browserContainer == null || webView == null) return;
            attachToRoot();
            for (WebView tab : tabs) tab.onResume();
        });
    }

    public void stop() {
        active = false;
        hideKeyboard();
        detachFromRoot();
        for (WebView tab : tabs) destroyWebView(tab);
        tabs.clear();
        activeTabIndex = -1;
        webView = null;
        webHost = null;
        addressField = null;
        tabCountButton = null;
        chromeBar = null;
        chromeDivider = null;
        progressBar = null;
        browserSurface = null;
        browserContainer = null;
    }

    public void destroy() {
        activity.runOnUiThread(this::stop);
    }

    private void ensureBrowserView() {
        if (browserContainer != null) return;

        browserContainer = new FrameLayout(activity);
        browserContainer.setBackgroundColor(Color.rgb(8, 10, 9));

        LinearLayout column = new LinearLayout(activity);
        browserSurface = column;
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackground(roundedDrawable(CHROME, dp(9), 0, Color.TRANSPARENT));
        column.setClipToOutline(true);
        browserContainer.addView(column, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        column.addView(createTopBar(), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpInt(43)
        ));

        progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(OLIVE));
        progressBar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(CHROME));
        column.addView(progressBar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpInt(2)
        ));

        webHost = new FrameLayout(activity);
        webHost.setBackgroundColor(PAGE);
        column.addView(webHost, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
    }

    private View createTopBar() {
        LinearLayout bar = new LinearLayout(activity);
        chromeBar = bar;
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dpInt(5), dpInt(4), dpInt(5), dpInt(4));
        bar.setBackgroundColor(CHROME);

        TextView back = controlButton("‹", "Back");
        back.setTextSize(24);
        back.setOnClickListener(view -> {
            if (webView != null && webView.canGoBack()) webView.goBack();
        });
        bar.addView(back, new LinearLayout.LayoutParams(dpInt(32), ViewGroup.LayoutParams.MATCH_PARENT));

        addressField = new EditText(activity);
        addressField.setSingleLine(true);
        addressField.setTextSize(13);
        addressField.setTextColor(INK);
        addressField.setHintTextColor(Color.rgb(104, 108, 99));
        addressField.setHint("Search or enter address");
        addressField.setPadding(dpInt(12), 0, dpInt(8), 0);
        addressField.setSelectAllOnFocus(true);
        addressField.setShowSoftInputOnFocus(false);
        addressField.setImeOptions(EditorInfo.IME_ACTION_GO);
        addressField.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        addressField.setBackgroundColor(Color.TRANSPARENT);
        addressField.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER)) {
                navigateFromAddress();
                return true;
            }
            return false;
        });
        LinearLayout addressAndTabs = new LinearLayout(activity);
        addressAndTabs.setGravity(Gravity.CENTER_VERTICAL);
        addressAndTabs.setBackgroundColor(Color.TRANSPARENT);
        LinearLayout.LayoutParams addressParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        addressAndTabs.addView(addressField, addressParams);

        tabCountButton = controlButton("1", "Tabs");
        tabCountButton.setTextSize(14);
        tabCountButton.setBackgroundColor(Color.TRANSPARENT);
        tabCountButton.setOnClickListener(this::showTabsMenu);
        TextView divider = new TextView(activity);
        chromeDivider = divider;
        divider.setBackgroundColor(CHROME_LINE);
        addressAndTabs.addView(divider, new LinearLayout.LayoutParams(dpInt(1), dpInt(20)));
        addressAndTabs.addView(tabCountButton, new LinearLayout.LayoutParams(dpInt(38), ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout.LayoutParams navigationParams = new LinearLayout.LayoutParams(0, dpInt(34), 1f);
        navigationParams.setMargins(dpInt(2), 0, dpInt(4), 0);
        bar.addView(addressAndTabs, navigationParams);

        TextView menu = controlButton("⋮", "Browser menu");
        menu.setTextSize(22);
        menu.setOnClickListener(this::showBrowserMenu);
        bar.addView(menu, new LinearLayout.LayoutParams(dpInt(31), ViewGroup.LayoutParams.MATCH_PARENT));
        return bar;
    }

    private TextView controlButton(String glyph, String description) {
        TextView button = new TextView(activity);
        button.setText(glyph);
        button.setTextColor(INK);
        button.setTextSize(22);
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
        target.setFocusableInTouchMode(true);
        target.setOnTouchListener((view, event) -> {
            addressPreviewActive = false;
            hideKeyboardSoon();
            return false;
        });

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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
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
                if (view != webView) return;
                setDisplayedAddress(url);
                emitState("loading");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (view != webView) return;
                installLauncherInputMode(view);
                syncChromeToPage(view);
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
                if (view != webView) return;
                if (progressBar != null) {
                    progressBar.setProgress(progress);
                    progressBar.setVisibility(progress >= 100 ? View.INVISIBLE : View.VISIBLE);
                }
            }
        });
    }

    private void installLauncherInputMode(WebView target) {
        if (target != null) target.evaluateJavascript(DISABLE_SYSTEM_IME_SCRIPT, null);
    }

    private void syncChromeToPage(WebView target) {
        target.evaluateJavascript(
            "(function(){"
                + "const clear=c=>!c||c==='transparent'||c==='rgba(0, 0, 0, 0)';"
                + "let c=getComputedStyle(document.body).backgroundColor;"
                + "if(clear(c))c=getComputedStyle(document.documentElement).backgroundColor;"
                + "const m=(c||'').match(/\\d+/g);"
                + "return m&&m.length>=3?((+m[0]<<16)|(+m[1]<<8)|+m[2]):null;"
                + "})()",
            value -> {
                if (value == null || "null".equals(value)) return;
                try {
                    int pageColor = Color.rgb(
                        (Integer.parseInt(value) >> 16) & 0xff,
                        (Integer.parseInt(value) >> 8) & 0xff,
                        Integer.parseInt(value) & 0xff
                    );
                    applyChromeColor(pageColor);
                } catch (NumberFormatException ignored) {
                    // Keep the neutral fallback until the page exposes a background.
                }
            }
        );
    }

    private void applyChromeColor(int pageColor) {
        int red = Color.red(pageColor);
        int green = Color.green(pageColor);
        int blue = Color.blue(pageColor);
        boolean light = (red * 299 + green * 587 + blue * 114) >= 150000;
        int foreground = light ? INK : Color.WHITE;
        if (chromeBar != null) {
            chromeBar.setBackgroundColor(pageColor);
            applyTextColor(chromeBar, foreground);
        }
        if (browserSurface != null) {
            browserSurface.setBackground(roundedDrawable(pageColor, dp(9), 0, Color.TRANSPARENT));
        }
        if (addressField != null) addressField.setHintTextColor(Color.argb(150, Color.red(foreground), Color.green(foreground), Color.blue(foreground)));
        if (chromeDivider != null) chromeDivider.setBackgroundColor(Color.argb(80, Color.red(foreground), Color.green(foreground), Color.blue(foreground)));
        if (progressBar != null) progressBar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(pageColor));
    }

    private void applyTextColor(View view, int color) {
        if (view instanceof TextView) ((TextView) view).setTextColor(color);
        if (!(view instanceof ViewGroup)) return;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) applyTextColor(group.getChildAt(index), color);
    }

    private void createTab(String url, boolean select) {
        if (tabs.size() >= MAX_TABS || webHost == null) {
            Toast.makeText(activity, "Four calm tabs are enough", Toast.LENGTH_SHORT).show();
            return;
        }
        WebView tab = new LauncherBrowserWebView(activity);
        configureWebView(tab);
        tabs.add(tab);
        webHost.addView(tab, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        if (select) switchToTab(tabs.size() - 1);
        tab.loadUrl(url == null ? START_URL : url);
        updateTabCount();
    }

    private void switchToTab(int index) {
        if (index < 0 || index >= tabs.size()) return;
        for (int i = 0; i < tabs.size(); i++) {
            tabs.get(i).setVisibility(i == index ? View.VISIBLE : View.GONE);
        }
        activeTabIndex = index;
        addressPreviewActive = false;
        webView = tabs.get(index);
        webView.bringToFront();
        setDisplayedAddress(webView.getUrl());
        if (progressBar != null) {
            int progress = webView.getProgress();
            progressBar.setProgress(progress);
            progressBar.setVisibility(progress >= 100 ? View.INVISIBLE : View.VISIBLE);
        }
        updateTabCount();
        emitState("tab-selected");
    }

    private void closeCurrentTab() {
        if (activeTabIndex < 0 || activeTabIndex >= tabs.size()) return;
        WebView closing = tabs.remove(activeTabIndex);
        if (webHost != null) webHost.removeView(closing);
        destroyWebView(closing);
        if (tabs.isEmpty()) {
            webView = null;
            activeTabIndex = -1;
            createTab(START_URL, true);
        } else {
            switchToTab(Math.min(activeTabIndex, tabs.size() - 1));
        }
        updateTabCount();
    }

    private void destroyWebView(WebView target) {
        if (target == null) return;
        target.stopLoading();
        target.loadUrl("about:blank");
        target.clearHistory();
        target.removeAllViews();
        target.destroy();
    }

    private void updateTabCount() {
        if (tabCountButton != null) tabCountButton.setText(String.valueOf(Math.max(1, tabs.size())));
    }

    private boolean switchRelativeTab(int delta) {
        if (tabs.size() < 2 || activeTabIndex < 0) return false;
        int next = (activeTabIndex + delta) % tabs.size();
        if (next < 0) next += tabs.size();
        switchToTab(next);
        return true;
    }

    private void showTabsMenu(View anchor) {
        if (anchor == null) return;
        final int tabBase = 100;
        final int newTab = 200;
        final int closeTab = 201;
        PopupMenu popup = new PopupMenu(activity, anchor);
        for (int i = 0; i < tabs.size(); i++) {
            WebView tab = tabs.get(i);
            String title = tab.getTitle();
            if (title == null || title.trim().isEmpty()) title = "New tab";
            if (title.length() > 28) title = title.substring(0, 28) + "…";
            popup.getMenu().add(0, tabBase + i, i, (i == activeTabIndex ? "✓ " : "") + title);
        }
        if (tabs.size() < MAX_TABS) popup.getMenu().add(1, newTab, 100, "+ New tab");
        popup.getMenu().add(1, closeTab, 101, "Close current tab");
        popup.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id >= tabBase && id < tabBase + tabs.size()) switchToTab(id - tabBase);
            else if (id == newTab) createTab(START_URL, true);
            else if (id == closeTab) closeCurrentTab();
            return true;
        });
        popup.show();
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
        addressPreviewActive = false;
        hideKeyboardSoon();
    }

    private boolean replaceInputPreview(String text) {
        if (text == null || text.isEmpty()) return false;
        if (addressPreviewActive) deleteInputCharacter();
        boolean handled = commitInputCharacter(text);
        addressPreviewActive = handled;
        return handled;
    }

    private boolean cancelInputPreview() {
        if (!addressPreviewActive) return false;
        boolean handled = deleteInputCharacter();
        addressPreviewActive = false;
        return handled;
    }

    private void commitInputText(String text) {
        addressPreviewActive = false;
        if (text != null && !text.isEmpty()) commitInputCharacter(text);
    }

    private boolean deleteInputText() {
        addressPreviewActive = false;
        return deleteInputCharacter();
    }

    private boolean commitInputCharacter(String text) {
        if (addressField != null && addressField.hasFocus()) {
            Editable editable = addressField.getText();
            int start = Math.max(0, addressField.getSelectionStart());
            int end = Math.max(start, addressField.getSelectionEnd());
            editable.replace(start, end, text);
            addressField.setSelection(start + text.length());
            return true;
        }
        InputConnection connection = currentWebInputConnection();
        if (connection != null) return connection.commitText(text, 1);
        KeyEvent[] events = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD).getEvents(text.toCharArray());
        if (events == null || webView == null) return false;
        for (KeyEvent event : events) webView.dispatchKeyEvent(event);
        return true;
    }

    private boolean deleteInputCharacter() {
        if (addressField != null && addressField.hasFocus()) {
            Editable editable = addressField.getText();
            int start = Math.max(0, addressField.getSelectionStart());
            int end = Math.max(start, addressField.getSelectionEnd());
            if (start != end) editable.delete(start, end);
            else if (start > 0) editable.delete(start - 1, start);
            return start != end || start > 0;
        }
        InputConnection connection = currentWebInputConnection();
        if (connection != null && connection.deleteSurroundingText(1, 0)) return true;
        return webView != null && webView.dispatchKeyEvent(
            new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL)
        );
    }

    private void submitFocusedInput() {
        addressPreviewActive = false;
        if (addressField != null && addressField.hasFocus()) {
            navigateFromAddress();
            return;
        }
        InputConnection connection = currentWebInputConnection();
        if (connection != null && connection.performEditorAction(EditorInfo.IME_ACTION_GO)) return;
        if (webView != null) {
            webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
            webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
        }
    }

    private InputConnection currentWebInputConnection() {
        if (!(webView instanceof LauncherBrowserWebView) || !webView.hasFocus()) return null;
        return ((LauncherBrowserWebView) webView).createLauncherInputConnection(new EditorInfo());
    }

    private void hideKeyboard() {
        InputMethodManager input = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        View focus = activity.getCurrentFocus();
        if (input != null && focus != null) input.hideSoftInputFromWindow(focus.getWindowToken(), 0);
    }

    private void hideKeyboardSoon() {
        hideKeyboard();
        if (browserContainer == null) return;
        browserContainer.postDelayed(this::hideKeyboard, 80);
        browserContainer.postDelayed(this::hideKeyboard, 240);
    }

    private void showBrowserMenu(View anchor) {
        PopupMenu popup = new PopupMenu(activity, anchor);
        popup.getMenu().add("Tabs");
        popup.getMenu().add("Reload");
        popup.getMenu().add("Forward");
        popup.getMenu().add("Open in browser");
        popup.getMenu().add("Clear session");
        popup.getMenu().add("Close");
        popup.setOnMenuItemClickListener(item -> {
            String title = String.valueOf(item.getTitle());
            if ("Tabs".equals(title)) {
                showTabsMenu(anchor);
            } else if ("Reload".equals(title)) {
                if (webView != null) webView.reload();
            } else if ("Forward".equals(title)) {
                if (webView != null && webView.canGoForward()) webView.goForward();
            } else if ("Open in browser".equals(title)) {
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
