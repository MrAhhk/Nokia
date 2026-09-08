package com.nokialauncher;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class InputSessionPolicyTest {
    @Test
    public void freshExternalInputStartsAndResetsTheComposer() {
        assertTrue(InputSessionPolicy.shouldRequestShow(false, NokiaIME.IMEState.ACTIVE));
        assertTrue(InputSessionPolicy.shouldResetComposer(false, NokiaIME.IMEState.ACTIVE));
    }

    @Test
    public void restartingInputDoesNotReshowOrResetTheComposer() {
        assertFalse(InputSessionPolicy.shouldRequestShow(true, NokiaIME.IMEState.ACTIVE));
        assertFalse(InputSessionPolicy.shouldResetComposer(true, NokiaIME.IMEState.ACTIVE));
    }

    @Test
    public void suppressedInputNeverReshowsOrResetsTheComposer() {
        assertFalse(InputSessionPolicy.shouldRequestShow(false, NokiaIME.IMEState.LAUNCHER_SUPPRESSED));
        assertFalse(InputSessionPolicy.shouldResetComposer(false, NokiaIME.IMEState.LAUNCHER_SUPPRESSED));
    }

    @Test
    public void computeTopInsetsLeavesVisibleSpaceForTargetApps() {
        // Standard 50% screen keypad
        int top50 = InputSessionPolicy.computeTopInsets(2400, 1200, 0);
        org.junit.Assert.assertEquals(1200, top50);
        assertNotEquals(0, top50);

        // Minimized keypad bar
        int topMinimized = InputSessionPolicy.computeTopInsets(2400, 160, 0);
        org.junit.Assert.assertEquals(2240, topMinimized);
        assertNotEquals(0, topMinimized);

        // Fallback when input area has not measured yet
        int topFallback = InputSessionPolicy.computeTopInsets(2400, 0, 1200);
        org.junit.Assert.assertEquals(1200, topFallback);

        // Bound safety: never negative
        int topClamped = InputSessionPolicy.computeTopInsets(1000, 1500, 0);
        org.junit.Assert.assertEquals(0, topClamped);
    }
}
