package com.nokialauncher.billing;

import android.app.Activity;
import android.os.Bundle;

/** Plain native payment window. No bridge, WebView, launcher task routing or rights owner. */
public final class BillingActivity extends Activity implements BillingPurchaseHost.Surface {
    private BillingPurchaseHost host;
    private long lease;
    @Override protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        host = BillingPurchaseHost.installed();
        if (host != null) lease = host.attach(this,
                getIntent().getStringExtra(BillingPurchaseHost.ATTEMPT),
                getIntent().getStringExtra(BillingPurchaseHost.CAPABILITY));
        // Process recreation has no native request. Never reconstruct one from saved extras.
        if (lease == 0) finish();
    }
    @Override protected void onResume() { super.onResume(); if (lease != 0) host.resume(this, lease); }
    @Override protected void onPause() { if (lease != 0) host.pause(this, lease); super.onPause(); }
    @Override protected void onDestroy() {
        if (lease != 0) host.detach(this, lease, isChangingConfigurations());
        lease = 0; host = null; super.onDestroy();
    }
    @Override public boolean alive() { return !isFinishing() && !isDestroyed(); }
    @Override public void close() { if (!isFinishing() && !isDestroyed()) finish(); }
}
