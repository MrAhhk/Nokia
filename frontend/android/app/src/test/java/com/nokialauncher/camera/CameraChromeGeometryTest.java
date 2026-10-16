package com.nokialauncher.camera;

import org.junit.Test;
import static org.junit.Assert.*;

public class CameraChromeGeometryTest {
    @Test public void visibleControlsRouteToTheirOwnActionsOnCompactAndTallLcds() {
        for (float density : new float[] {1f, 2f, 3f}) {
            for (float heightDp : new float[] {220f, 280f, 300f, 360f, 480f}) {
                float height = heightDp * density;
                float width = 280f * density;
                CameraChromeGeometry chrome = new CameraChromeGeometry(height, density);
                assertEquals("shutter", chrome.bottomControl(width / 2f, chrome.controlY, width));
                assertEquals("gallery", chrome.bottomControl(36f * density, chrome.controlY, width));
                assertEquals("flip", chrome.bottomControl(width - 37f * density, chrome.controlY, width));
                assertEquals("mode-video", chrome.bottomControl(width / 2f - 34f * density, chrome.modeY, width));
                assertEquals("mode-photo", chrome.bottomControl(width / 2f + 34f * density, chrome.modeY, width));
                assertTrue("Mode pill and shutter backdrop must not overlap", chrome.modeY + 10f * density < chrome.controlY - chrome.shutterRadius - 7f * density);
                assertTrue(chrome.controlY + chrome.shutterRadius + 7f * density <= height);
            }
        }
    }
}
