package com.nokialauncher.camera;

import org.junit.Test;
import static org.junit.Assert.*;

public class BitmapDecodePolicyTest {
    @Test public void largePhotosDecodeNearDisplaySizeInsteadOfFullResolution() {
        assertEquals(16, BitmapDecodePolicy.sampleSize(8000, 6000, 320));
        assertEquals(16, BitmapDecodePolicy.sampleSize(6000, 8000, 320));
        assertEquals(32, BitmapDecodePolicy.sampleSize(12000, 500, 320));
        assertEquals(1, BitmapDecodePolicy.sampleSize(160, 120, 320));
        assertEquals(2, BitmapDecodePolicy.sampleSize(8000, 6000, 2048));
    }
}
