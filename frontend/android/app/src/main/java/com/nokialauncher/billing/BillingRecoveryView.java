package com.nokialauncher.billing;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.nokialauncher.R;

/** Local escape controls. No bridge, provider, payment, user-data mutation or retry loop. */
@SuppressLint("ViewConstructor") // Created only by the owning Home Activity, never inflated from XML.
public final class BillingRecoveryView extends ScrollView {
    private static final int INK = Color.rgb(17, 24, 3);
    private static final int LCD = Color.rgb(157, 168, 77);

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable panel(int color, boolean border) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(border ? 8 : 12));
        if (border) background.setStroke(dp(2), INK);
        return background;
    }

    public BillingRecoveryView(Activity activity) {
        super(activity);
        setFillViewport(true);
        setBackgroundColor(Color.rgb(8, 10, 9));
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding * 2, padding, padding * 2);
        addView(content, new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        LinearLayout screen = new LinearLayout(activity);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setPadding(dp(20), dp(20), dp(20), dp(20));
        screen.setBackground(panel(LCD, false));
        content.addView(screen, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        TextView brand = new TextView(activity);
        brand.setText(activity.getString(R.string.app_name));
        brand.setTextColor(INK);
        brand.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        brand.setTextSize(11);
        brand.setPadding(0, 0, 0, dp(18));
        screen.addView(brand);
        TextView title = new TextView(activity);
        title.setText(R.string.billing_recovery_title);
        title.setTextColor(INK);
        title.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        title.setTextSize(26);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) title.setAccessibilityHeading(true);
        screen.addView(title);
        TextView message = new TextView(activity);
        message.setText(R.string.billing_recovery_message);
        message.setTextColor(INK);
        message.setTextSize(16);
        message.setPadding(0, padding, 0, padding);
        screen.addView(message);
        addAction(activity, screen, activity.getString(R.string.billing_recovery_phone), new Intent(Intent.ACTION_DIAL, Uri.parse("tel:")), message);
        addAction(activity, screen, activity.getString(R.string.billing_recovery_home), new Intent(Settings.ACTION_HOME_SETTINGS), message);
        addAction(activity, screen, activity.getString(R.string.billing_recovery_settings), new Intent(Settings.ACTION_SETTINGS), message);
        addAction(activity, screen, activity.getString(R.string.billing_recovery_keyboard), new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS), message);
    }

    private void addAction(Activity activity, LinearLayout content, String label, Intent intent, TextView message) {
        Button button = new Button(activity);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(INK);
        button.setTextSize(16);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setMinHeight(dp(48));
        button.setPadding(dp(12), dp(10), dp(12), dp(10));
        button.setBackground(panel(LCD, true));
        button.setBackgroundTintList(null);
        button.setOnClickListener(view -> {
            try {
                // Only an explicit user tap starts system UI; never foreground Home on a timeout.
                activity.startActivity(intent);
            } catch (ActivityNotFoundException | SecurityException unavailable) {
                message.setText(activity.getString(R.string.billing_recovery_action_failed, label));
            }
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        content.addView(button, params);
    }
}
