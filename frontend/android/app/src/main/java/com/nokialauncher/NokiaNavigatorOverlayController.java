package com.nokialauncher;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;

public final class NokiaNavigatorOverlayController
        implements ControlSurfaceCoordinator.Listener {
    public interface IntentListener {
        void onIntent(String intent);
    }

    private final WindowManager windowManager;
    private final View root;
    private final WindowManager.LayoutParams layoutParams;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean attached;
    private boolean destroyed;

    public NokiaNavigatorOverlayController(Context context, IntentListener intentListener) {
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        root = LayoutInflater.from(context).inflate(R.layout.nokia_navigator_overlay, null, false);
        layoutParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                dp(context, 112),
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        layoutParams.gravity = Gravity.BOTTOM;

        bindIntent(R.id.navigator_soft_left, "SOFT_LEFT", intentListener);
        bindIntent(R.id.navigator_green, "GREEN", intentListener);
        bindIntent(R.id.navigator_left, "LEFT", intentListener);
        bindIntent(R.id.navigator_up, "UP", intentListener);
        bindIntent(R.id.navigator_select, "SELECT", intentListener);
        bindIntent(R.id.navigator_down, "DOWN", intentListener);
        bindIntent(R.id.navigator_right, "RIGHT", intentListener);
        bindIntent(R.id.navigator_soft_right, "SOFT_RIGHT", intentListener);
        bindIntent(R.id.navigator_red, "END", intentListener);

        ControlSurfaceCoordinator.addListener(this);
        updateMode(ControlSurfaceCoordinator.getMode());
    }

    @Override
    public void onControlSurfaceModeChanged(ControlSurfaceMode mode) {
        updateMode(mode);
    }

    public void updateMode(ControlSurfaceMode mode) {
        runOnMain(() -> {
            if (mode == ControlSurfaceMode.NAVIGATION) {
                showNow();
            } else {
                hideNow();
            }
        });
    }

    public void show() {
        runOnMain(this::showNow);
    }

    public void hide() {
        runOnMain(this::hideNow);
    }

    public void destroy() {
        destroyed = true;
        ControlSurfaceCoordinator.removeListener(this);
        runOnMain(this::hideNow);
    }

    private void showNow() {
        if (destroyed || attached || windowManager == null) {
            return;
        }
        windowManager.addView(root, layoutParams);
        attached = true;
    }

    private void hideNow() {
        if (!attached || windowManager == null) {
            return;
        }
        windowManager.removeView(root);
        attached = false;
    }

    private void bindIntent(int viewId, String intent, IntentListener intentListener) {
        root.findViewById(viewId).setOnClickListener(view -> {
            if (intentListener != null) {
                intentListener.onIntent(intent);
            }
        });
    }

    private void runOnMain(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run();
        } else {
            mainHandler.post(action);
        }
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
