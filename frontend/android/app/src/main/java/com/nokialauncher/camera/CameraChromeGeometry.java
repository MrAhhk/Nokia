package com.nokialauncher.camera;

/** Shared floating-control positions for painting and touch routing, in physical pixels. */
final class CameraChromeGeometry {
    final float bottom;
    final float modeY;
    final float controlY;
    final float shutterRadius;
    final float modeBoundary;

    CameraChromeGeometry(float height, float density) {
        bottom = Math.min(height * 0.48f, Math.max(height * 0.21f, 104f * density));
        modeY = height - bottom + 22f * density;
        controlY = height - bottom * 0.30f;
        shutterRadius = Math.min(24f * density, bottom * 0.21f);
        float modeBottom = modeY + 10f * density;
        float controlTop = controlY - shutterRadius - 7f * density;
        modeBoundary = (modeBottom + controlTop) / 2f;
    }

    String bottomControl(float x, float y, float width) {
        if (y < modeBoundary) return x < width / 2f ? "mode-video" : "mode-photo";
        if (x < width * 0.30f) return "gallery";
        if (x > width * 0.70f) return "flip";
        return "shutter";
    }
}
